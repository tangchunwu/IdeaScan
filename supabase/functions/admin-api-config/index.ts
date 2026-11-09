import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clearConfigCache } from "../_shared/config-resolver.ts";
import { normalizeLlmBaseUrl, requestChatCompletion } from "../_shared/llm-client.ts";

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
        const { api_key, ...rest } = row;
        groups[row.config_group].push({
          ...rest,
          api_key: "",
          api_key_display: api_key ? maskValue(api_key) : "",
        });
      }

      // Always append env-var virtual entries (after DB entries) so they stay visible
      const allGroupIds = ["llm", "search_llm", "image", "search_api"];
      for (const gid of allGroupIds) {
        const envEntries = buildEnvEntries(gid);
        if (envEntries.length > 0) {
          if (!groups[gid]) groups[gid] = [];
          // Avoid duplicating: only add env entries whose label+base_url aren't already in DB
          const existing = new Set(groups[gid].map((r: any) => `${r.label}||${r.base_url}`));
          for (const e of envEntries) {
            if (!existing.has(`${e.label}||${e.base_url}`)) {
              groups[gid].push({ ...e, api_key: "" });
            }
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
        const resolved = { ...provider, api_key: await resolveKey(adminClient, provider) };
        const result = await testProvider(resolved);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Import all env-var entries server-side (keys never reach the browser)
      if (action === "import_env") {
        const { data: rows } = await adminClient.from("admin_api_configs").select("config_group,label,base_url");
        const existing = new Set((rows || []).map((r: any) => `${r.config_group}||${r.label}||${(r.base_url || "").trim()}`));
        let imported = 0;
        for (const gid of ["llm", "search_llm", "image", "search_api"]) {
          for (const e of buildEnvEntries(gid)) {
            if (existing.has(`${gid}||${e.label}||${(e.base_url || "").trim()}`)) continue;
            const { error } = await adminClient.from("admin_api_configs").insert({
              config_group: gid, priority: e.priority, label: e.label, base_url: (e.base_url || "").trim(),
              api_key: e.api_key, model: e.model, enabled: true,
              updated_at: new Date().toISOString(), updated_by: user.id,
            });
            if (!error) imported++;
          }
        }
        clearConfigCache();
        return new Response(JSON.stringify({ success: true, imported }), {
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
          base_url: (provider.base_url || "").trim(),
          api_key: await resolveKey(adminClient, provider),
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
          if (!provider.api_key || provider.api_key.startsWith("****")) {
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return new Response(JSON.stringify({ error: message || "Internal error" }), {
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
      // 统一使用 OpenAI-compatible 端点构造；/v1 不能再次拼接成 /v1/v1。
      const completion = await requestChatCompletion({
        baseUrl: normalizeLlmBaseUrl(base_url),
        apiKey: api_key,
        model: model || "gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 5,
        timeoutMs: 15000,
      });
      const latencyMs = Date.now() - start;
      return { success: true, message: `连通正常 ✅ (${latencyMs}ms · ${completion.endpoint})`, latencyMs };
    }

    if (config_group === "image") {
      const cleanUrl = normalizeLlmBaseUrl(base_url);
      const parsed = new URL(cleanUrl);
      const modelsEndpoint = `${cleanUrl}${parsed.pathname.replace(/\/$/, '') === '/v1' ? '' : '/v1'}/models`;
      const resp = await fetch(modelsEndpoint, {
        headers: { Authorization: `Bearer ${api_key}` },
        signal: AbortSignal.timeout(10000),
      });
      const latencyMs = Date.now() - start;
      if (!resp.ok) return { success: false, message: `HTTP ${resp.status}`, latencyMs };
      return { success: true, message: `连通正常 ✅ (${latencyMs}ms)`, latencyMs };
    }

    return { success: false, message: "未知配置组" };
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : String(e);
    const message = /http_404/i.test(raw)
      ? "HTTP 404：请确认 Base URL、模型访问权限和账号可用模型列表。gpt-6.1-sol 是 OpenAI 官方模型；如果模型存在但仍失败，请检查账号 tier、项目权限和请求参数。"
      : /http_401|authentication|authorized/i.test(raw)
        ? "HTTP 401：API Key 无效或没有该模型权限"
        : `测试失败: ${raw.slice(0, 240)}`;
    return { success: false, message, latencyMs: Date.now() - start };
  }
}

/** Use the typed key if given; otherwise look up the stored key (DB row or env var) server-side. */
async function resolveKey(adminClient: any, provider: any): Promise<string> {
  const typed = typeof provider?.api_key === "string" ? provider.api_key.trim() : "";
  if (typed && !typed.startsWith("****")) return typed;
  const id: string = provider?.id || "";
  if (id.startsWith("env-")) {
    const envEntry = buildEnvEntries(provider.config_group).find((e) => e.id.split("-")[1] === id.split("-")[1]);
    return envEntry?.api_key || "";
  }
  if (id && !id.startsWith("new-")) {
    const { data } = await adminClient.from("admin_api_configs").select("api_key").eq("id", id).maybeSingle();
    return data?.api_key || "";
  }
  return "";
}
