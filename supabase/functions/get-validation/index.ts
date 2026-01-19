import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 验证用户身份
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 创建 Supabase 客户端
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 验证 JWT token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 获取 validation ID (支持 body 或 query 参数)
    let validationId: string | null = null;
    
    if (req.method === "POST") {
      try {
        const body = await req.json();
        validationId = body.id;
      } catch {
        // ignore parse error
      }
    }
    
    if (!validationId) {
      const url = new URL(req.url);
      validationId = url.searchParams.get("id");
    }

    if (!validationId) {
      return new Response(
        JSON.stringify({ error: "Validation ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 获取验证记录
    const { data: validation, error: validationError } = await supabase
      .from("validations")
      .select("*")
      .eq("id", validationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (validationError) {
      console.error("Error fetching validation:", validationError);
      throw new Error("Failed to fetch validation");
    }

    if (!validation) {
      return new Response(
        JSON.stringify({ error: "Validation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 获取报告数据
    const { data: report, error: reportError } = await supabase
      .from("validation_reports")
      .select("*")
      .eq("validation_id", validationId)
      .maybeSingle();

    if (reportError) {
      console.error("Error fetching report:", reportError);
    }

    return new Response(
      JSON.stringify({
        validation,
        report,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    console.error("Error in get-validation function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
