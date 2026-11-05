import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createExternalApiKey, extractExternalApiKey, hashExternalApiKey, isExternalApiKey } from "./api-key-crypto.ts";

export { createExternalApiKey, extractExternalApiKey, hashExternalApiKey, isExternalApiKey } from "./api-key-crypto.ts";

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}


export async function authenticateExternalApiKeyValue(value: string, requiredScope?: string): Promise<{ userId: string; scopes: string[] } | null> {
  if (!isExternalApiKey(value)) return null;
  const hash = await hashExternalApiKey(value);
  const client = serviceClient();
  const { data, error } = await client
    .from("external_api_keys")
    .select("id,user_id,scopes,revoked_at")
    .eq("key_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const scopes = Array.isArray(data.scopes) ? data.scopes.filter((scope: unknown): scope is string => typeof scope === "string") : [];
  if (requiredScope && !scopes.includes(requiredScope)) return null;
  await client.from("external_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { userId: data.user_id, scopes };
}
