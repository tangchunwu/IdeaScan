import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { action } = body;

    // ---- request_pair: called by bridge.py (no auth needed) ----
    if (action === "request_pair") {
      const { machine_name, backend, work_dir } = body;

      // Generate unique 6-char code, retry on collision
      let code = "";
      for (let attempt = 0; attempt < 5; attempt++) {
        code = generateCode();
        const { error } = await supabase
          .from("openclaw_pairing_codes")
          .insert({
            code,
            machine_name: machine_name || "default",
            backend: backend || "claude",
            work_dir: work_dir || ".",
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          });
        if (!error) break;
        if (error.code === "23505") continue; // unique violation, retry
        throw error;
      }

      return new Response(JSON.stringify({ code }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- confirm_pair: called by web UI (needs auth) ----
    if (action === "confirm_pair") {
      const { code: inputCode } = body;
      if (!inputCode || inputCode.length !== 6) {
        return new Response(JSON.stringify({ error: "invalid_code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get user from auth header
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user }, error: authError } = await anonClient.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find unclaimed, unexpired code
      const normalizedCode = inputCode.toUpperCase().trim();
      const { data: pairing, error: findErr } = await supabase
        .from("openclaw_pairing_codes")
        .select("*")
        .eq("code", normalizedCode)
        .is("claimed_by", null)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (findErr || !pairing) {
        return new Response(
          JSON.stringify({ error: "code_not_found", message: "配对码无效或已过期" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create a new connection for this user
      const connToken = crypto.randomUUID();
      const { data: conn, error: connErr } = await supabase
        .from("openclaw_connections")
        .insert({
          user_id: user.id,
          name: pairing.machine_name || "default",
          url: "relay://",
          token: connToken,
          mode: "relay",
          is_default: false,
        })
        .select("id")
        .single();

      if (connErr) throw connErr;

      // Mark code as claimed
      await supabase
        .from("openclaw_pairing_codes")
        .update({
          claimed_by: user.id,
          connection_id: conn.id,
        })
        .eq("id", pairing.id);

      return new Response(
        JSON.stringify({
          success: true,
          connection_id: conn.id,
          token: connToken,
          backend: pairing.backend,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- check_pair: called by bridge.py polling (no auth) ----
    if (action === "check_pair") {
      const { code: checkCode } = body;
      if (!checkCode) {
        return new Response(JSON.stringify({ error: "missing_code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: pairing } = await supabase
        .from("openclaw_pairing_codes")
        .select("claimed_by, connection_id")
        .eq("code", checkCode.toUpperCase().trim())
        .single();

      if (!pairing) {
        return new Response(JSON.stringify({ status: "not_found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (pairing.claimed_by && pairing.connection_id) {
        // Fetch the connection token
        const { data: conn } = await supabase
          .from("openclaw_connections")
          .select("id, token")
          .eq("id", pairing.connection_id)
          .single();

        return new Response(
          JSON.stringify({
            status: "paired",
            connection_id: conn?.id,
            token: conn?.token,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ status: "waiting" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown_action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("openclaw-pair error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
