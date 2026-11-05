const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { password } = await req.json();
    // 密码填错是用户输入问题，不是服务故障：用 200 + ok:false 返回，
    // 这样前端能直接显示原因，也不会把一次输错记成后端报错。
    if (!password || typeof password !== "string") {
      return new Response(JSON.stringify({ ok: false, error: "密码不能为空" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expected = Deno.env.get("ADMIN_GATE_PASSWORD");
    if (!expected) {
      return new Response(JSON.stringify({ ok: false, error: "管理密码未配置" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (password !== expected) {
      return new Response(JSON.stringify({ ok: false, error: "密码错误" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a simple session token (hash of password + date)
    const encoder = new TextEncoder();
    const data = encoder.encode(expected + new Date().toISOString().slice(0, 10));
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const token = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return new Response(JSON.stringify({ ok: true, token }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
