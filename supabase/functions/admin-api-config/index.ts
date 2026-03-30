import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clearConfigCache } from "../_shared/config-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function maskValue(value: string): string {
  if (!value || value.length <= 8) return "****";
  return "****" + value.slice(-4);
}

async function verifyAdmin(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Unauthorized");

  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");

  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");

  return { user, adminClient };
}

/** Build virtual entries from env vars for groups with no DB records */
function buildEnvEntries(group: string): any[] {
  const entries: any[] = [];
  const ts = new Date().toISOString();

  if (group === "llm") {
    const key = Deno.env.get("LLM_API_KEY");
    const url = Deno.env.get("LLM_BASE_URL");
    if (key && url) {
      entries.push({
        id: `env-llm-${Date.now()}`,
        config_group: "llm",
        priority: 0,
        label: "环境变量 LLM",
        base_url: url,
        api_key: key,
        api_key_display: maskValue(key),
        model: Deno.env.get("LLM_MODEL") || "",
        enabled: true,
        updated_at: ts,
        _source: "env",
      });
    }
  } else if (group === "search_llm") {
    const key = Deno.env.get("PERPLEXITY_API_KEY");
    const url = Deno.env.get("PERPLEXITY_BASE_URL");
    if (key && url) {
      entries.push({
        id: `env-perplexity-${Date.now()}`,
        config_group: "search_llm",
        priority: 0,
        label: "环境变量 Perplexity",
        base_url: url,
        api_key: key,
        api_key_display: maskValue(key),
        model: Deno.env.get("PERPLEXITY_MODEL") || "sonar",
        enabled: true,
        updated_at: ts,
        _source: "env",
      });
    }
  } else if (group === "image") {
    const key = Deno.env.get("IMAGE_GEN_API_KEY");
    const url = Deno.env.get("IMAGE_GEN_BASE_URL");
    if (key && url) {
      entries.push({
        id: `env-image-${Date.now()}`,
        config_group: "image",
        priority: 0,
        label: "环境变量 Image",
        base_url: url,
        api_key: key,
        api_key_display: maskValue(key),
        model: Deno.env.get("IMAGE_GEN_MODEL") || "dall-e-3",
        enabled: true,
        updated_at: ts,
        _source: "env",
      });
    }
  } else if (group === "search_api") {
    let p = 0;
    const tavily = Deno.env.get("TAVILY_API_KEY");
    if (tavily) {
      entries.push({
        id: `env-tavily-${Date.now()}`,
        config_group: "search_api",
        priority: p++,
        label: "Tavily",
        base_url: "",
        api_key: tavily,
        api_key_display: maskValue(tavily),
        model: "tavily",
        enabled: true,
        updated_at: ts,
        _source: "env",
      });
    }
    const bocha = Deno.env.get("BOCHA_API_KEY");
    if (bocha) {
      entries.push({
        id: `env-bocha-${Date.now()}`,
        config_group: "search_api",
        priority: p++,
        label: "Bocha",
        base_url: "",
        api_key: bocha,
        api_key_display: maskValue(bocha),
        model: "bocha",
        enabled: true,
        updated_at: ts,
        _source: "env",
      });
    }
    const you = Deno.env.get("YOU_API_KEY");
    if (you) {
      entries.push({
        id: `env-you-${Date.now()}`,
        config_group: "search_api",
        priority: p++,
        label: "You",
        base_url: "",
        api_key: you,
        api_key_display: maskValue(you),
        model: "you",
        enabled: true,
        updated_at: ts,
        _source: "env",
      });
    }
  }

  return entries;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user, adminClient } = await verifyAdmin(req);

    // Parse body - all requests come as POST from supabase.functions.invoke
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action || new URL(req.url).searchParams.get("action") || (req.method === "GET" ? "list" : null);

    // LIST — list all providers per group
    if (action === "list" || req.method === "GET") {
      const { data, error } = await adminClient
        .from("admin_api_configs")
        .select("*")
        .order("config_group")
        .order("priority");

      if (error) throw error;

      // Group by config_group
      const groups: Record<string, any[]> = {};
      for (const row of (data || [])) {
        if (!groups[row.config_group]) groups[row.config_group] = [];
        groups[row.config_group].push({
          ...row,
          api_key_display: row.api_key ? maskValue(row.api_key) : "",
        });
      }

      // For groups with NO DB entries, inject env-var virtual entries
      const allGroupIds = ["llm", "search_llm", "image", "search_api"];
      for (const gid of allGroupIds) {
        if (!groups[gid] || groups[gid].length === 0) {
          const envEntries = buildEnvEntries(gid);
          if (envEntries.length > 0) {
            groups[gid] = envEntries;
          }
        }
      }

      // Check env fallbacks for groups with no DB entries
      const envStatus: Record<string, boolean> = {
        llm: !!(Deno.env.get("LLM_API_KEY") && Deno.env.get("LLM_BASE_URL")),
        search_llm: !!(Deno.env.get("PERPLEXITY_API_KEY") && Deno.env.get("PERPLEXITY_BASE_URL")),
        image: !!(Deno.env.get("IMAGE_GEN_API_KEY") && Deno.env.get("IMAGE_GEN_BASE_URL")),
        search_api: !!(Deno.env.get("TAVILY_API_KEY") || Deno.env.get("BOCHA_API_KEY") || Deno.env.get("YOU_API_KEY")),
      };

      const lovableReady = !!Deno.env.get("LOVABLE_API_KEY");

      return new Response(JSON.stringify({ groups, envStatus, lovableReady }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

      // Test connectivity for a specific provider
      if (action === "test") {
        const { provider } = body;
        const result = await testProvider(provider);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Save a provider (upsert)
      if (action === "save") {
        const { provider } = body;
        if (!provider || !provider.config_group) {
          return new Response(JSON.stringify({ error: "Invalid provider" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const record = {
          config_group: provider.config_group,
          priority: provider.priority ?? 0,
          label: provider.label || "",
          base_url: provider.base_url || "",
          api_key: provider.api_key || "",
          model: provider.model || "",
          enabled: provider.enabled !== false,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        };

        // Treat env-* IDs as new entries
        const isNew = !provider.id || provider.id.startsWith("new-") || provider.id.startsWith("env-");

        if (!isNew) {
          // Update existing — skip api_key if masked
          const updateRecord: any = { ...record };
          if (provider.api_key && provider.api_key.startsWith("****")) {
            delete updateRecord.api_key;
          }
          const { error } = await adminClient
            .from("admin_api_configs")
            .update(updateRecord)
            .eq("id", provider.id);
          if (error) throw error;
        } else {
          // Insert new
          const { error } = await adminClient
            .from("admin_api_configs")
            .insert(record);
          if (error) throw error;
        }

        // Clear config cache so changes take effect immediately
        clearConfigCache();

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete a provider
      if (action === "delete") {
        const { id } = body;
        if (!id) {
          return new Response(JSON.stringify({ error: "Missing id" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { error } = await adminClient
          .from("admin_api_configs")
          .delete()
          .eq("id", id);
        if (error) throw error;

        clearConfigCache();

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const status = err.message === "Unauthorized" ? 401 : err.message === "Forbidden" ? 403 : 500;
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function testProvider(provider: any): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  const start = Date.now();
  try {
    const { config_group, base_url, api_key, model } = provider;

    if (config_group === "search_api") {
      if (!api_key) return { success: false, message: "API Key 未填写" };
      return { success: true, message: `${model || "search"} Key 已配置 ✅`, latencyMs: Date.now() - start };
    }

    if (!base_url || !api_key) return { success: false, message: "Base URL 或 API Key 未填写" };

    if (config_group === "llm" || config_group === "search_llm") {
      let cleanUrl = base_url.replace(/\/$/, "");
      // Strip trailing /chat/completions or /v1/chat/completions if user pasted the full endpoint
      cleanUrl = cleanUrl.replace(/\/v1\/chat\/completions$/i, "").replace(/\/chat\/completions$/i, "");
      const endpoint = config_group === "search_llm"
        ? `${cleanUrl}/chat/completions`
        : `${cleanUrl}/v1/chat/completions`;

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model || "gpt-3.5-turbo",
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const latencyMs = Date.now() - start;
      if (!resp.ok) return { success: false, message: `HTTP ${resp.status}`, latencyMs };
      return { success: true, message: `连通正常 ✅ (${latencyMs}ms)`, latencyMs };
    }

    if (config_group === "image") {
      const resp = await fetch(`${base_url.replace(/\/$/, "")}/v1/models`, {
        headers: { Authorization: `Bearer ${api_key}` },
        signal: AbortSignal.timeout(10000),
      });
      const latencyMs = Date.now() - start;
      if (!resp.ok) return { success: false, message: `HTTP ${resp.status}`, latencyMs };
      return { success: true, message: `连通正常 ✅ (${latencyMs}ms)`, latencyMs };
    }

    return { success: false, message: "未知配置组" };
  } catch (e) {
    return { success: false, message: `测试失败: ${e.message}`, latencyMs: Date.now() - start };
  }
}
