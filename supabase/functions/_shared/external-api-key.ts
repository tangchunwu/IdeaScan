import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createExternalApiKey, extractExternalApiKey, hashExternalApiKey, isExternalApiKey } from "./api-key-crypto.ts";

export { createExternalApiKey, extractExternalApiKey, hashExternalApiKey, isExternalApiKey } from "./api-key-crypto.ts";

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}


export async function authenticateExternalApiKeyValue(value: string, requiredScope?: string, enforceRateLimit = true): Promise<{ userId: string; scopes: string[]; keyId: string } | null> {
  if (!isExternalApiKey(value)) return null;
  const hash = await hashExternalApiKey(value);
  const client = serviceClient();
  const { data, error } = await client
    .from("external_api_keys")
    .select("id,user_id,scopes,rate_limit_per_minute,revoked_at")
    .eq("key_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const scopes = Array.isArray(data.scopes) ? data.scopes.filter((scope: unknown): scope is string => typeof scope === "string") : [];
  if (requiredScope && !scopes.includes(requiredScope)) return null;
  if (enforceRateLimit) {
    const { data: allowed, error: rateError } = await client.rpc("check_external_api_key_rate_limit", { p_key_id: data.id, p_limit: Number(data.rate_limit_per_minute || 30) });
    if (rateError || allowed !== true) return null;
  }
  await client.from("external_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { userId: data.user_id, scopes, keyId: data.id };
}
