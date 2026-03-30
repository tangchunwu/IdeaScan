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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user, adminClient } = await verifyAdmin(req);
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // GET — list all providers per group
    if (req.method === "GET") {
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

    // POST
    if (req.method === "POST") {
      const body = await req.json();

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

        if (provider.id && !provider.id.startsWith("new-")) {
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
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      const cleanUrl = base_url.replace(/\/$/, "");
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
