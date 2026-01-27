import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ValidationError, createErrorResponse } from "../_shared/validation.ts";
import { checkRateLimit, RateLimitError, createRateLimitResponse } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AES-256-GCM encryption for secure storage of user settings
// Uses WebCrypto API for strong, authenticated encryption

const ENCRYPTION_VERSION = "v2"; // Track encryption version for migration

// Derive a cryptographic key from user ID and server secret
async function deriveKey(userId: string): Promise<CryptoKey> {
  const serverSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const keyMaterial = new TextEncoder().encode(userId + serverSecret);
  
  // Import as raw key material for PBKDF2
  const baseKey = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  
  // Derive AES-256-GCM key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("lovable-user-settings-v2"),
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Encrypt settings using AES-256-GCM
async function encrypt(plaintext: string, userId: string): Promise<string> {
  const key = await deriveKey(userId);
  
  // Generate random 12-byte IV (nonce) for each encryption
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  
  // Combine version + IV + ciphertext for storage
  const combined = new Uint8Array(2 + iv.length + encrypted.byteLength);
  combined[0] = 0x02; // Version marker (v2)
  combined[1] = iv.length;
  combined.set(iv, 2);
  combined.set(new Uint8Array(encrypted), 2 + iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

// Decrypt settings using AES-256-GCM
async function decrypt(encoded: string, userId: string): Promise<string> {
  try {
    const decoded = atob(encoded);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }
    
    // Check version marker
    if (bytes[0] === 0x02) {
      // v2 AES-256-GCM format
      const ivLength = bytes[1];
      const iv = bytes.slice(2, 2 + ivLength);
      const ciphertext = bytes.slice(2 + ivLength);
      
      const key = await deriveKey(userId);
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
      );
      
      return new TextDecoder().decode(decrypted);
    } else {
      // Legacy v1 XOR format - decrypt with old method then re-encrypt with v2
      return decryptLegacyXOR(encoded, userId);
    }
  } catch (error) {
    console.error("Decryption failed:", error);
    return "";
  }
}

// Legacy XOR decryption for backward compatibility during migration
function decryptLegacyXOR(encoded: string, userId: string): string {
  try {
    const key = userId + (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.slice(0, 32) || "");
    const keyBytes = new TextEncoder().encode(key);
    const decoded = atob(encoded);
    const bytes = new Uint8Array(decoded.length);
    
    for (let i = 0; i < decoded.length; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }
    
    const result = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      result[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
    }
    
    return new TextDecoder().decode(result);
  } catch {
    return "";
  }
}

// Check if data uses legacy XOR format (needs migration)
function isLegacyFormat(encoded: string): boolean {
  try {
    const decoded = atob(encoded);
    if (decoded.length < 2) return true;
    // v2 format starts with 0x02 version marker
    return decoded.charCodeAt(0) !== 0x02;
  } catch {
    return true;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new ValidationError("Authorization required");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new ValidationError("Invalid or expired session");

    // Check rate limit
    await checkRateLimit(supabase, user.id, "get-validation"); // Reuse existing limit

    if (req.method === "GET") {
      // Fetch user settings
      const { data: settings, error } = await supabase
        .from("user_settings")
        .select("settings_encrypted")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching settings:", error);
        throw new Error("Failed to fetch settings");
      }

      if (!settings || !settings.settings_encrypted) {
        return new Response(
          JSON.stringify({ settings: null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Decrypt settings (handles both v1 and v2 formats)
      const decrypted = await decrypt(settings.settings_encrypted, user.id);
      let parsed = null;
      try {
        parsed = JSON.parse(decrypted);
      } catch {
        console.error("Failed to parse settings");
      }

      // Auto-migrate legacy XOR format to AES-256-GCM
      if (parsed && isLegacyFormat(settings.settings_encrypted)) {
        const upgraded = await encrypt(JSON.stringify(parsed), user.id);
        await supabase
          .from("user_settings")
          .update({ settings_encrypted: upgraded })
          .eq("user_id", user.id);
        console.log(`Migrated user ${user.id} settings to v2 encryption`);
      }

      return new Response(
        JSON.stringify({ settings: parsed }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (req.method === "POST") {
      // Save user settings
      const body = await req.json();
      const settingsToSave = body.settings;

      if (!settingsToSave || typeof settingsToSave !== "object") {
        throw new ValidationError("Settings object is required");
      }

      // Encrypt settings with AES-256-GCM
      const encrypted = await encrypt(JSON.stringify(settingsToSave), user.id);

      // Upsert settings
      const { error } = await supabase
        .from("user_settings")
        .upsert({
          user_id: user.id,
          settings_encrypted: encrypted,
        }, {
          onConflict: "user_id"
        });

      if (error) {
        console.error("Error saving settings:", error);
        throw new Error("Failed to save settings");
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new ValidationError("Method not allowed");
  } catch (error: unknown) {
    if (error instanceof RateLimitError) {
      return createRateLimitResponse(error, corsHeaders);
    }
    return createErrorResponse(error, corsHeaders);
  }
});
