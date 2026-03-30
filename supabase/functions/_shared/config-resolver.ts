import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// In-memory cache: key -> { value, expiry }
const cache = new Map<string, { value: string; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Resolve a config value:
 * 1. Check in-memory cache
 * 2. Query admin_api_configs table
 * 3. Fallback to Deno.env.get()
 */
export async function resolveConfig(key: string): Promise<string | undefined> {
  // 1. Check cache
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiry) {
    return cached.value || undefined;
  }

  // 2. Query DB
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, serviceKey);

    const { data, error } = await client
      .from("admin_api_configs")
      .select("config_value")
      .eq("config_key", key)
      .maybeSingle();

    if (!error && data && data.config_value) {
      cache.set(key, { value: data.config_value, expiry: Date.now() + CACHE_TTL_MS });
      return data.config_value;
    }
  } catch (e) {
    console.warn(`[config-resolver] DB lookup failed for ${key}:`, e);
  }

  // 3. Fallback to env
  const envVal = Deno.env.get(key);
  if (envVal) {
    cache.set(key, { value: envVal, expiry: Date.now() + CACHE_TTL_MS });
  }
  return envVal;
}

/** Resolve multiple keys at once (single DB query) */
export async function resolveConfigs(keys: string[]): Promise<Record<string, string | undefined>> {
  const result: Record<string, string | undefined> = {};
  const uncachedKeys: string[] = [];

  // Check cache first
  for (const key of keys) {
    const cached = cache.get(key);
    if (cached && Date.now() < cached.expiry) {
      result[key] = cached.value || undefined;
    } else {
      uncachedKeys.push(key);
    }
  }

  if (uncachedKeys.length === 0) return result;

  // Batch DB query
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, serviceKey);

    const { data, error } = await client
      .from("admin_api_configs")
      .select("config_key, config_value")
      .in("config_key", uncachedKeys);

    if (!error && data) {
      for (const row of data) {
        if (row.config_value) {
          cache.set(row.config_key, { value: row.config_value, expiry: Date.now() + CACHE_TTL_MS });
          result[row.config_key] = row.config_value;
        }
      }
    }
  } catch (e) {
    console.warn(`[config-resolver] Batch DB lookup failed:`, e);
  }

  // Fill remaining from env
  for (const key of uncachedKeys) {
    if (!result[key]) {
      const envVal = Deno.env.get(key);
      if (envVal) {
        cache.set(key, { value: envVal, expiry: Date.now() + CACHE_TTL_MS });
      }
      result[key] = envVal;
    }
  }

  return result;
}

/** Clear cache (useful after admin updates configs) */
export function clearConfigCache() {
  cache.clear();
}
