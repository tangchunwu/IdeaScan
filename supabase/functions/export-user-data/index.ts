import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExportResult {
  exportedAt: string;
  userId: string;
  tables: {
    [tableName: string]: {
      count: number;
      data: any[];
    };
  };
  summary: {
    totalRecords: number;
    tablesExported: number;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    // Create admin client for full access
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ExportData] Starting export for user: ${user.id}`);

    const result: ExportResult = {
      exportedAt: new Date().toISOString(),
      userId: user.id,
      tables: {},
      summary: {
        totalRecords: 0,
        tablesExported: 0,
      },
    };

    // 1. Export validations (user's own)
    const { data: validations, error: valError } = await supabaseAdmin
      .from("validations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!valError && validations) {
      result.tables.validations = { count: validations.length, data: validations };
      result.summary.totalRecords += validations.length;
      result.summary.tablesExported++;
      console.log(`[ExportData] Exported ${validations.length} validations`);
    }

    // 2. Export validation_reports (for user's validations)
    const validationIds = validations?.map(v => v.id) || [];
    if (validationIds.length > 0) {
      const { data: reports, error: repError } = await supabaseAdmin
        .from("validation_reports")
        .select("*")
        .in("validation_id", validationIds);

      if (!repError && reports) {
        result.tables.validation_reports = { count: reports.length, data: reports };
        result.summary.totalRecords += reports.length;
        result.summary.tablesExported++;
        console.log(`[ExportData] Exported ${reports.length} validation reports`);
      }
    }

    // 3. Export comments (on user's validations)
    if (validationIds.length > 0) {
      const { data: comments, error: comError } = await supabaseAdmin
        .from("comments")
        .select("*")
        .in("validation_id", validationIds);

      if (!comError && comments) {
        result.tables.comments = { count: comments.length, data: comments };
        result.summary.totalRecords += comments.length;
        result.summary.tablesExported++;
        console.log(`[ExportData] Exported ${comments.length} comments`);
      }
    }

    // 4. Export user_topic_interests (user's bookmarks)
    const { data: interests, error: intError } = await supabaseAdmin
      .from("user_topic_interests")
      .select("*")
      .eq("user_id", user.id);

    if (!intError && interests) {
      result.tables.user_topic_interests = { count: interests.length, data: interests };
      result.summary.totalRecords += interests.length;
      result.summary.tablesExported++;
      console.log(`[ExportData] Exported ${interests.length} topic interests`);
    }

    // 5. Export user_topic_clicks (user's interaction history)
    const { data: clicks, error: clkError } = await supabaseAdmin
      .from("user_topic_clicks")
      .select("*")
      .eq("user_id", user.id);

    if (!clkError && clicks) {
      result.tables.user_topic_clicks = { count: clicks.length, data: clicks };
      result.summary.totalRecords += clicks.length;
      result.summary.tablesExported++;
      console.log(`[ExportData] Exported ${clicks.length} topic clicks`);
    }

    // 6. Export scan_jobs (user's hunter jobs)
    const { data: scanJobs, error: sjError } = await supabaseAdmin
      .from("scan_jobs")
      .select("*")
      .eq("created_by", user.id);

    if (!sjError && scanJobs) {
      result.tables.scan_jobs = { count: scanJobs.length, data: scanJobs };
      result.summary.totalRecords += scanJobs.length;
      result.summary.tablesExported++;
      console.log(`[ExportData] Exported ${scanJobs.length} scan jobs`);
    }

    // 7. Export mvp_landing_pages (user's MVP pages)
    const { data: mvpPages, error: mvpError } = await supabaseAdmin
      .from("mvp_landing_pages")
      .select("*")
      .eq("user_id", user.id);

    if (!mvpError && mvpPages) {
      result.tables.mvp_landing_pages = { count: mvpPages.length, data: mvpPages };
      result.summary.totalRecords += mvpPages.length;
      result.summary.tablesExported++;
      console.log(`[ExportData] Exported ${mvpPages.length} MVP landing pages`);

      // 8. Export mvp_leads (leads for user's pages)
      const pageIds = mvpPages.map(p => p.id);
      if (pageIds.length > 0) {
        const { data: leads, error: leadError } = await supabaseAdmin
          .from("mvp_leads")
          .select("*")
          .in("landing_page_id", pageIds);

        if (!leadError && leads) {
          result.tables.mvp_leads = { count: leads.length, data: leads };
          result.summary.totalRecords += leads.length;
          result.summary.tablesExported++;
          console.log(`[ExportData] Exported ${leads.length} MVP leads`);
        }
      }
    }

    // 9. Export trending_topics created by user
    const { data: topics, error: topError } = await supabaseAdmin
      .from("trending_topics")
      .select("*")
      .eq("created_by", user.id);

    if (!topError && topics) {
      result.tables.trending_topics = { count: topics.length, data: topics };
      result.summary.totalRecords += topics.length;
      result.summary.tablesExported++;
      console.log(`[ExportData] Exported ${topics.length} trending topics`);
    }

    // 10. Export user_settings (note: encrypted, won't work in new project without re-entry)
    const { data: settings, error: setError } = await supabaseAdmin
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!setError && settings) {
      result.tables.user_settings = { 
        count: 1, 
        data: [{ 
          ...settings, 
          _note: "Settings are encrypted and cannot be migrated. Please re-enter API keys in the new project." 
        }] 
      };
      result.summary.totalRecords += 1;
      result.summary.tablesExported++;
      console.log(`[ExportData] Exported user settings (encrypted)`);
    }

    // 11. Export demand_experiments (user's demand validation experiments)
    const { data: experiments, error: expError } = await supabaseAdmin
      .from("demand_experiments")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!expError && experiments && experiments.length > 0) {
      result.tables.demand_experiments = { count: experiments.length, data: experiments };
      result.summary.totalRecords += experiments.length;
      result.summary.tablesExported++;
      console.log(`[ExportData] Exported ${experiments.length} demand experiments`);

      // 12. Export experiment_events (for user's experiments)
      const experimentIds = experiments.map(e => e.id);
      const { data: events, error: evtError } = await supabaseAdmin
        .from("experiment_events")
        .select("*")
        .in("experiment_id", experimentIds);

      if (!evtError && events && events.length > 0) {
        result.tables.experiment_events = { count: events.length, data: events };
        result.summary.totalRecords += events.length;
        result.summary.tablesExported++;
        console.log(`[ExportData] Exported ${events.length} experiment events`);
      }

      // 13. Export idea_proof_snapshots (for user's experiments)
      const { data: snapshots, error: snapError } = await supabaseAdmin
        .from("idea_proof_snapshots")
        .select("*")
        .in("experiment_id", experimentIds);

      if (!snapError && snapshots && snapshots.length > 0) {
        result.tables.idea_proof_snapshots = { count: snapshots.length, data: snapshots };
        result.summary.totalRecords += snapshots.length;
        result.summary.tablesExported++;
        console.log(`[ExportData] Exported ${snapshots.length} proof snapshots`);
      }
    }

    // 14. Export user_feedback
    const { data: feedback, error: fbError } = await supabaseAdmin
      .from("user_feedback")
      .select("*")
      .eq("user_id", user.id);

    if (!fbError && feedback && feedback.length > 0) {
      result.tables.user_feedback = { count: feedback.length, data: feedback };
      result.summary.totalRecords += feedback.length;
      result.summary.tablesExported++;
      console.log(`[ExportData] Exported ${feedback.length} feedback entries`);
    }

    console.log(`[ExportData] Export complete: ${result.summary.totalRecords} records from ${result.summary.tablesExported} tables`);

    return new Response(
      JSON.stringify(result, null, 2),
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="lovable-export-${user.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json"`
        } 
      }
    );

  } catch (error: unknown) {
    console.error("[ExportData] Error:", error);
    const message = error instanceof Error ? error.message : "Export failed";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
