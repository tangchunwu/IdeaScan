import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createExternalApiKey } from "../_shared/external-api-key.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function getUser(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : data.user;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "仅支持 POST 请求" }, 405);
  const user = await getUser(req);
  if (!user) return response({ error: "请先登录" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const action = body.action || "list";

  if (action === "list") {
    const { data, error } = await admin.from("external_api_keys").select("id,name,key_prefix,scopes,rate_limit_per_minute,last_used_at,revoked_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) return response({ error: "读取 API Key 失败" }, 500);
    return response({ keys: data || [] });
  }

  if (action === "create") {
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : "默认 API Key";
    const created = await createExternalApiKey();
    const { data, error } = await admin.from("external_api_keys").insert({ user_id: user.id, name, key_prefix: created.prefix, key_hash: created.hash }).select("id,name,key_prefix,scopes,rate_limit_per_minute,created_at").single();
    if (error) return response({ error: "创建 API Key 失败" }, 500);
    return response({ key: data, raw_key: created.rawKey });
  }

  if (action === "revoke") {
    if (typeof body.id !== "string") return response({ error: "缺少 Key ID" }, 400);
    const { error } = await admin.from("external_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", body.id).eq("user_id", user.id).is("revoked_at", null);
    if (error) return response({ error: "撤销 API Key 失败" }, 500);
    return response({ success: true });
  }

  return response({ error: "未知操作" }, 400);
});
