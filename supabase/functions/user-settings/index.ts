import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ValidationError, createErrorResponse } from "../_shared/validation.ts";
import { checkRateLimit, RateLimitError, createRateLimitResponse } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple encryption/decryption using XOR with a key derived from user ID
// This is obfuscation, not strong encryption, but prevents casual reading
function obfuscate(text: string, key: string): string {
  const keyBytes = new TextEncoder().encode(key);
  const textBytes = new TextEncoder().encode(text);
  const result = new Uint8Array(textBytes.length);
  
  for (let i = 0; i < textBytes.length; i++) {
    result[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  return btoa(String.fromCharCode(...result));
}

function deobfuscate(encoded: string, key: string): string {
  try {
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

    // Use a combination of user ID and a server secret for obfuscation
    const obfuscationKey = user.id + (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.slice(0, 32) || "");

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

      // Deobfuscate settings
      const decrypted = deobfuscate(settings.settings_encrypted, obfuscationKey);
      let parsed = null;
      try {
        parsed = JSON.parse(decrypted);
      } catch {
        console.error("Failed to parse settings");
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

      // Obfuscate settings
      const encrypted = obfuscate(JSON.stringify(settingsToSave), obfuscationKey);

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
