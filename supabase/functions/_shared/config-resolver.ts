import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ProviderConfig {
  id: string;
  base_url: string;
  api_key: string;
  model: string;
  label: string;
  priority: number;
  enabled: boolean;
}

// Cache: group -> { providers, expiry }
const cache = new Map<string, { providers: ProviderConfig[]; expiry: number }>();
const CACHE_TTL_MS = 1 * 60 * 1000;

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

/**
 * Get all enabled providers for a group, ordered by priority (ascending = higher priority).
 * Falls back to env vars if no DB entries exist.
 */
export async function resolvePool(group: string): Promise<ProviderConfig[]> {
  const cached = cache.get(group);
  if (cached && Date.now() < cached.expiry) {
    return cached.providers;
  }

  try {
    const client = getServiceClient();
    const { data, error } = await client
      .from("admin_api_configs")
      .select("*")
      .eq("config_group", group)
      .eq("enabled", true)
      .order("priority", { ascending: true });

    if (!error && data && data.length > 0) {
      const providers = data.map((d: any) => ({
        id: d.id,
        base_url: d.base_url,
        api_key: d.api_key,
        model: d.model,
        label: d.label,
        priority: d.priority,
        enabled: d.enabled,
      }));
      // Always append Lovable AI as final fallback for llm and image groups
      if (group === "llm" || group === "image") {
        const lovable = Deno.env.get("LOVABLE_API_KEY");
        if (lovable && !providers.some((p: ProviderConfig) => p.id.startsWith("env-lovable"))) {
          providers.push({
            id: group === "llm" ? "env-lovable" : "env-lovable-img",
            base_url: "https://ai.gateway.lovable.dev/v1",
            api_key: lovable,
            model: group === "llm" ? "google/gemini-2.5-flash" : "google/gemini-2.5-flash-image",
            label: "Lovable AI (兜底)",
            priority: 999,
            enabled: true,
          });
        }
      }
      cache.set(group, { providers, expiry: Date.now() + CACHE_TTL_MS });
      return providers;
    }
  } catch (e) {
    console.warn(`[config-resolver] DB lookup failed for pool ${group}:`, e);
  }

  // Fallback to env vars
  const envProviders = buildEnvFallback(group);
  if (envProviders.length > 0) {
    cache.set(group, { providers: envProviders, expiry: Date.now() + CACHE_TTL_MS });
  }
  return envProviders;
}

function buildEnvFallback(group: string): ProviderConfig[] {
  const providers: ProviderConfig[] = [];

  if (group === "llm") {
    const key = Deno.env.get("LLM_API_KEY");
    const url = Deno.env.get("LLM_BASE_URL");
    if (key && url) {
      providers.push({
        id: "env-llm",
        base_url: url,
        api_key: key,
        model: Deno.env.get("LLM_MODEL") || "google/gemini-3-flash-preview",
        label: "环境变量 LLM",
        priority: 0,
        enabled: true,
      });
    }
    // Always add Lovable AI as last fallback
    const lovable = Deno.env.get("LOVABLE_API_KEY");
    if (lovable) {
      providers.push({
        id: "env-lovable",
        base_url: "https://ai.gateway.lovable.dev/v1",
        api_key: lovable,
        model: "google/gemini-2.5-flash",
        label: "Lovable AI (兜底)",
        priority: 999,
        enabled: true,
      });
    }
  } else if (group === "search_llm") {
    const key = Deno.env.get("PERPLEXITY_API_KEY");
    const url = Deno.env.get("PERPLEXITY_BASE_URL");
    if (key && url) {
      providers.push({
        id: "env-perplexity",
        base_url: url,
        api_key: key,
        model: Deno.env.get("PERPLEXITY_MODEL") || "sonar",
        label: "环境变量 Perplexity",
        priority: 0,
        enabled: true,
      });
    }
  } else if (group === "image") {
    const key = Deno.env.get("IMAGE_GEN_API_KEY");
    const url = Deno.env.get("IMAGE_GEN_BASE_URL");
    if (key && url) {
      providers.push({
        id: "env-image",
        base_url: url,
        api_key: key,
        model: Deno.env.get("IMAGE_GEN_MODEL") || "dall-e-3",
        label: "环境变量 Image",
        priority: 0,
        enabled: true,
      });
    }
    const lovable = Deno.env.get("LOVABLE_API_KEY");
    if (lovable) {
      providers.push({
        id: "env-lovable-img",
        base_url: "https://ai.gateway.lovable.dev/v1",
        api_key: lovable,
        model: "google/gemini-2.5-flash-image",
        label: "Lovable AI (兜底)",
        priority: 999,
        enabled: true,
      });
    }
  } else if (group === "search_api") {
    const tavily = Deno.env.get("TAVILY_API_KEY");
    if (tavily) providers.push({ id: "env-tavily", base_url: "", api_key: tavily, model: "tavily", label: "Tavily", priority: 0, enabled: true });
    const bocha = Deno.env.get("BOCHA_API_KEY");
    if (bocha) providers.push({ id: "env-bocha", base_url: "", api_key: bocha, model: "bocha", label: "Bocha", priority: 1, enabled: true });
    const you = Deno.env.get("YOU_API_KEY");
    if (you) providers.push({ id: "env-you", base_url: "", api_key: you, model: "you", label: "You", priority: 2, enabled: true });
  }

  return providers;
}

/** Resolve single config value (backward compat) - returns first provider's value */
export async function resolveConfig(key: string): Promise<string | undefined> {
  // Map old key names to pool groups
  const keyGroupMap: Record<string, { group: string; field: keyof ProviderConfig }> = {
    LLM_BASE_URL: { group: "llm", field: "base_url" },
    LLM_API_KEY: { group: "llm", field: "api_key" },
    LLM_MODEL: { group: "llm", field: "model" },
    PERPLEXITY_BASE_URL: { group: "search_llm", field: "base_url" },
    PERPLEXITY_API_KEY: { group: "search_llm", field: "api_key" },
    PERPLEXITY_MODEL: { group: "search_llm", field: "model" },
    IMAGE_GEN_BASE_URL: { group: "image", field: "base_url" },
    IMAGE_GEN_API_KEY: { group: "image", field: "api_key" },
    IMAGE_GEN_MODEL: { group: "image", field: "model" },
    TAVILY_API_KEY: { group: "search_api", field: "api_key" },
    BOCHA_API_KEY: { group: "search_api", field: "api_key" },
    YOU_API_KEY: { group: "search_api", field: "api_key" },
  };

  const mapping = keyGroupMap[key];
  if (!mapping) return Deno.env.get(key);

  const pool = await resolvePool(mapping.group);
  if (pool.length > 0) {
    return String(pool[0][mapping.field]) || undefined;
  }
  return Deno.env.get(key);
}

/** Resolve multiple keys (backward compat) */
export async function resolveConfigs(keys: string[]): Promise<Record<string, string | undefined>> {
  const result: Record<string, string | undefined> = {};
  for (const key of keys) {
    result[key] = await resolveConfig(key);
  }
  return result;
}

/** Clear cache */
export function clearConfigCache() {
  cache.clear();
}
