import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code, redirect_uri } = await req.json();

    if (!code) {
      return new Response(JSON.stringify({ error: "Missing authorization code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const CLIENT_ID = Deno.env.get("LINUXDO_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("LINUXDO_CLIENT_SECRET");

    if (!CLIENT_ID || !CLIENT_SECRET) {
      console.error("Missing LINUXDO_CLIENT_ID or LINUXDO_CLIENT_SECRET");
      return new Response(JSON.stringify({ error: "OAuth provider not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Exchange code for access token
    const tokenRes = await fetch("https://connect.linux.do/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirect_uri || "",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Token exchange failed:", tokenRes.status, errText);
      return new Response(JSON.stringify({ error: "Token exchange failed", detail: errText }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "No access_token in response" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Get user info from Linux DO
    const userRes = await fetch("https://connect.linux.do/api/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      const errText = await userRes.text();
      console.error("User info fetch failed:", userRes.status, errText);
      return new Response(JSON.stringify({ error: "Failed to fetch user info" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const linuxdoUser = await userRes.json();
    console.log("Linux DO user:", JSON.stringify({ id: linuxdoUser.id, username: linuxdoUser.username, name: linuxdoUser.name }));

    // Step 3: Create or sign in user via Supabase Admin API
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Use a deterministic email based on Linux DO user id
    const providerEmail = linuxdoUser.email || `linuxdo_${linuxdoUser.id}@linuxdo.placeholder`;
    const providerId = `linuxdo_${linuxdoUser.id}`;
    const displayName = linuxdoUser.name || linuxdoUser.username || `LinuxDO用户${linuxdoUser.id}`;
    const avatarUrl = linuxdoUser.avatar_url || linuxdoUser.avatar_template
      ? `https://linux.do${(linuxdoUser.avatar_template || "").replace("{size}", "120")}`
      : null;

    // Try to find existing user by provider id stored in user_metadata
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 1000,
    });

    let targetUser = existingUsers?.users?.find(
      (u) => u.user_metadata?.linuxdo_id === String(linuxdoUser.id)
    );

    if (!targetUser) {
      // Also try matching by email if the user has a real email
      if (linuxdoUser.email) {
        targetUser = existingUsers?.users?.find(
          (u) => u.email === linuxdoUser.email
        );
      }
    }

    if (targetUser) {
      // Update metadata
      await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
        user_metadata: {
          ...targetUser.user_metadata,
          linuxdo_id: String(linuxdoUser.id),
          linuxdo_username: linuxdoUser.username,
          full_name: displayName,
          avatar_url: avatarUrl,
          trust_level: linuxdoUser.trust_level,
        },
      });

      // Generate a magic link to sign them in (creates session directly)
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: targetUser.email!,
      });

      if (linkError || !linkData) {
        console.error("Generate link failed:", linkError);
        return new Response(JSON.stringify({ error: "Failed to create session" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Extract token from the link and verify to get session
      const hashed_token = linkData.properties?.hashed_token;
      const { data: verifyData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
        type: "magiclink",
        token_hash: hashed_token!,
      });

      if (verifyError || !verifyData.session) {
        console.error("Verify OTP failed:", verifyError);
        return new Response(JSON.stringify({ error: "Failed to verify session" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        session: verifyData.session,
        user: verifyData.user,
        is_new: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Create new user
      const randomPassword = crypto.randomUUID() + crypto.randomUUID();

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: providerEmail,
        password: randomPassword,
        email_confirm: true,
        user_metadata: {
          linuxdo_id: String(linuxdoUser.id),
          linuxdo_username: linuxdoUser.username,
          full_name: displayName,
          avatar_url: avatarUrl,
          trust_level: linuxdoUser.trust_level,
        },
      });

      if (createError || !newUser.user) {
        console.error("Create user failed:", createError);
        return new Response(JSON.stringify({ error: "Failed to create user", detail: createError?.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Sign in the new user
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: providerEmail,
      });

      if (linkError || !linkData) {
        console.error("Generate link for new user failed:", linkError);
        return new Response(JSON.stringify({ error: "Failed to create session" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const hashed_token = linkData.properties?.hashed_token;
      const { data: verifyData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
        type: "magiclink",
        token_hash: hashed_token!,
      });

      if (verifyError || !verifyData.session) {
        console.error("Verify OTP for new user failed:", verifyError);
        return new Response(JSON.stringify({ error: "Failed to verify session" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        session: verifyData.session,
        user: verifyData.user,
        is_new: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("linuxdo-auth error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
