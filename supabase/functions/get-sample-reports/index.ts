import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch active sample reports with their validations
    const { data: sampleReports, error: samplesError } = await supabase
      .from("sample_reports")
      .select("id, title, display_order, validation_id")
      .eq("is_active", true)
      .order("display_order");

    if (samplesError) {
      console.error("Error fetching sample reports:", samplesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch sample reports" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!sampleReports || sampleReports.length === 0) {
      return new Response(
        JSON.stringify({ samples: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch validation details for each sample
    const validationIds = sampleReports.map(s => s.validation_id);
    
    const { data: validations, error: validationsError } = await supabase
      .from("validations")
      .select("id, idea, overall_score, tags, created_at")
      .in("id", validationIds);

    if (validationsError) {
      console.error("Error fetching validations:", validationsError);
    }

    // Map validations to samples
    const validationMap = new Map(validations?.map(v => [v.id, v]) || []);
    
    const samples = sampleReports.map(sample => ({
      ...sample,
      validation: validationMap.get(sample.validation_id) || null,
    }));

    return new Response(
      JSON.stringify({ samples }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in get-sample-reports:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
