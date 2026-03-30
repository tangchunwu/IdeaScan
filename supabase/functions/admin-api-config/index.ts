import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function maskValue(value: string): string {
  if (!value || value.length <= 8) return "****";
  return "****" + value.slice(-4);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin check
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // GET - read all configs (masked)
    if (req.method === "GET") {
      const { data, error } = await adminClient
        .from("admin_api_configs")
        .select("*")
        .order("config_group");

      if (error) throw error;

      // Define all config keys with their groups
      const allKeys = [
        { key: "LLM_BASE_URL", group: "llm", isSecret: false },
        { key: "LLM_API_KEY", group: "llm", isSecret: true },
        { key: "LLM_MODEL", group: "llm", isSecret: false },
        { key: "PERPLEXITY_BASE_URL", group: "search_llm", isSecret: false },
        { key: "PERPLEXITY_API_KEY", group: "search_llm", isSecret: true },
        { key: "PERPLEXITY_MODEL", group: "search_llm", isSecret: false },
        { key: "IMAGE_GEN_BASE_URL", group: "image", isSecret: false },
        { key: "IMAGE_GEN_API_KEY", group: "image", isSecret: true },
        { key: "IMAGE_GEN_MODEL", group: "image", isSecret: false },
        { key: "TAVILY_API_KEY", group: "search_api", isSecret: true },
        { key: "BOCHA_API_KEY", group: "search_api", isSecret: true },
        { key: "YOU_API_KEY", group: "search_api", isSecret: true },
      ];

      const dbMap = new Map(data?.map((d: any) => [d.config_key, d]) || []);

      const configs = allKeys.map((k) => {
        const dbRow = dbMap.get(k.key) as any;
        const rawValue = dbRow?.config_value || Deno.env.get(k.key) || "";
        return {
          config_key: k.key,
          config_group: k.group,
          display_value: k.isSecret && rawValue ? maskValue(rawValue) : rawValue,
          has_value: !!rawValue,
          source: dbRow?.config_value ? "database" : rawValue ? "env" : "none",
          updated_at: dbRow?.updated_at || null,
        };
      });

      // Lovable AI status
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      configs.push({
        config_key: "LOVABLE_API_KEY",
        config_group: "fallback",
        display_value: lovableKey ? "已配置" : "未配置",
        has_value: !!lovableKey,
        source: "env",
        updated_at: null,
      });

      return new Response(JSON.stringify({ configs }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST
    if (req.method === "POST") {
      const body = await req.json();

      // Test connectivity
      if (action === "test") {
        const { group } = body;
        const result = await testConnectivity(adminClient, group);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Save configs
      const { configs } = body;
      if (!Array.isArray(configs)) {
        return new Response(JSON.stringify({ error: "Invalid payload" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const allowedKeys = new Set([
        "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL",
        "PERPLEXITY_BASE_URL", "PERPLEXITY_API_KEY", "PERPLEXITY_MODEL",
        "IMAGE_GEN_BASE_URL", "IMAGE_GEN_API_KEY", "IMAGE_GEN_MODEL",
        "TAVILY_API_KEY", "BOCHA_API_KEY", "YOU_API_KEY",
      ]);

      for (const item of configs) {
        if (!allowedKeys.has(item.config_key)) continue;
        // Skip masked values (user didn't change)
        if (item.config_value && item.config_value.startsWith("****")) continue;

        const { error } = await adminClient
          .from("admin_api_configs")
          .upsert(
            {
              config_key: item.config_key,
              config_value: item.config_value || "",
              config_group: item.config_group,
              updated_at: new Date().toISOString(),
              updated_by: user.id,
            },
            { onConflict: "config_key" }
          );

        if (error) {
          console.error(`Failed to upsert ${item.config_key}:`, error);
          throw error;
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[admin-api-config] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function testConnectivity(
  client: any,
  group: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Resolve values from DB first, then env
    const getVal = async (key: string) => {
      const { data } = await client
        .from("admin_api_configs")
        .select("config_value")
        .eq("config_key", key)
        .maybeSingle();
      return data?.config_value || Deno.env.get(key) || "";
    };

    if (group === "llm") {
      const baseUrl = await getVal("LLM_BASE_URL");
      const apiKey = await getVal("LLM_API_KEY");
      const model = await getVal("LLM_MODEL");
      if (!baseUrl || !apiKey) return { success: false, message: "Base URL 或 API Key 未配置" };

      const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: model || "gpt-3.5-turbo", messages: [{ role: "user", content: "hi" }], max_tokens: 5 }),
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) return { success: false, message: `HTTP ${resp.status}: ${await resp.text().catch(() => "")}` };
      return { success: true, message: "连通正常 ✅" };
    }

    if (group === "search_llm") {
      const baseUrl = await getVal("PERPLEXITY_BASE_URL");
      const apiKey = await getVal("PERPLEXITY_API_KEY");
      if (!baseUrl || !apiKey) return { success: false, message: "Base URL 或 API Key 未配置" };

      const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: await getVal("PERPLEXITY_MODEL") || "sonar", messages: [{ role: "user", content: "test" }], max_tokens: 5 }),
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) return { success: false, message: `HTTP ${resp.status}` };
      return { success: true, message: "连通正常 ✅" };
    }

    if (group === "image") {
      const baseUrl = await getVal("IMAGE_GEN_BASE_URL");
      const apiKey = await getVal("IMAGE_GEN_API_KEY");
      if (!baseUrl || !apiKey) return { success: false, message: "Base URL 或 API Key 未配置" };
      // Just validate the endpoint responds
      const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) return { success: false, message: `HTTP ${resp.status}` };
      return { success: true, message: "连通正常 ✅" };
    }

    if (group === "search_api") {
      const results: string[] = [];
      const tavily = await getVal("TAVILY_API_KEY");
      const bocha = await getVal("BOCHA_API_KEY");
      const you = await getVal("YOU_API_KEY");
      if (tavily) results.push("Tavily ✅");
      if (bocha) results.push("Bocha ✅");
      if (you) results.push("You ✅");
      if (results.length === 0) return { success: false, message: "无搜索引擎 API Key 配置" };
      return { success: true, message: results.join(", ") };
    }

    return { success: false, message: "未知配置组" };
  } catch (e) {
    return { success: false, message: `测试失败: ${e.message}` };
  }
}
