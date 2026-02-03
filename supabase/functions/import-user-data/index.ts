import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Schema for validating import data structure
const ImportDataSchema = z.object({
  exportedAt: z.string(),
  userId: z.string(),
  tables: z.record(z.object({
    count: z.number(),
    data: z.array(z.record(z.any())),
  })),
  summary: z.object({
    totalRecords: z.number(),
    tablesExported: z.number(),
  }),
});

interface ImportResult {
  success: boolean;
  importedAt: string;
  tables: {
    [tableName: string]: {
      imported: number;
      skipped: number;
      errors: string[];
    };
  };
  summary: {
    totalImported: number;
    totalSkipped: number;
    totalErrors: number;
  };
  idMappings: {
    validations: Record<string, string>;
    mvp_landing_pages: Record<string, string>;
    trending_topics: Record<string, string>;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
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

    // Parse and validate import data
    const body = await req.json();
    const importData = body.data;

    if (!importData) {
      return new Response(
        JSON.stringify({ error: "Import data is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate structure
    const parseResult = ImportDataSchema.safeParse(importData);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: "Invalid import data format", details: parseResult.error.errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ImportData] Starting import for user: ${user.id}`);
    console.log(`[ImportData] Source user: ${importData.userId}, exported at: ${importData.exportedAt}`);

    const result: ImportResult = {
      success: true,
      importedAt: new Date().toISOString(),
      tables: {},
      summary: {
        totalImported: 0,
        totalSkipped: 0,
        totalErrors: 0,
      },
      idMappings: {
        validations: {},
        mvp_landing_pages: {},
        trending_topics: {},
      },
    };

    const tables = importData.tables;

    // Helper to initialize table result
    const initTableResult = (tableName: string) => {
      result.tables[tableName] = { imported: 0, skipped: 0, errors: [] };
    };

    // 1. Import validations (must be first - other tables reference it)
    if (tables.validations?.data?.length > 0) {
      initTableResult("validations");
      console.log(`[ImportData] Importing ${tables.validations.count} validations...`);

      for (const validation of tables.validations.data) {
        try {
          const oldId = validation.id;
          const newValidation = {
            idea: validation.idea,
            tags: validation.tags || [],
            status: validation.status || "completed",
            overall_score: validation.overall_score,
            user_id: user.id, // Replace with new user ID
            created_at: validation.created_at,
            updated_at: new Date().toISOString(),
          };

          const { data: inserted, error } = await supabaseAdmin
            .from("validations")
            .insert(newValidation)
            .select("id")
            .single();

          if (error) {
            result.tables.validations.errors.push(`Validation ${oldId}: ${error.message}`);
            result.tables.validations.skipped++;
          } else {
            result.idMappings.validations[oldId] = inserted.id;
            result.tables.validations.imported++;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          result.tables.validations.errors.push(msg);
          result.tables.validations.skipped++;
        }
      }
      console.log(`[ImportData] Validations: ${result.tables.validations.imported} imported, ${result.tables.validations.skipped} skipped`);
    }

    // 2. Import validation_reports (requires validation ID mapping)
    if (tables.validation_reports?.data?.length > 0) {
      initTableResult("validation_reports");
      console.log(`[ImportData] Importing ${tables.validation_reports.count} validation reports...`);

      for (const report of tables.validation_reports.data) {
        try {
          const oldValidationId = report.validation_id;
          const newValidationId = result.idMappings.validations[oldValidationId];

          if (!newValidationId) {
            result.tables.validation_reports.errors.push(`Report ${report.id}: No matching validation found`);
            result.tables.validation_reports.skipped++;
            continue;
          }

          const newReport = {
            validation_id: newValidationId,
            market_analysis: report.market_analysis,
            xiaohongshu_data: report.xiaohongshu_data,
            competitor_data: report.competitor_data,
            sentiment_analysis: report.sentiment_analysis,
            ai_analysis: report.ai_analysis,
            persona: report.persona,
            dimensions: report.dimensions,
            data_summary: report.data_summary,
            data_quality_score: report.data_quality_score,
            keywords_used: report.keywords_used,
            created_at: report.created_at,
          };

          const { error } = await supabaseAdmin
            .from("validation_reports")
            .insert(newReport);

          if (error) {
            result.tables.validation_reports.errors.push(`Report: ${error.message}`);
            result.tables.validation_reports.skipped++;
          } else {
            result.tables.validation_reports.imported++;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          result.tables.validation_reports.errors.push(msg);
          result.tables.validation_reports.skipped++;
        }
      }
      console.log(`[ImportData] Reports: ${result.tables.validation_reports.imported} imported`);
    }

    // 3. Import comments (requires validation ID mapping)
    if (tables.comments?.data?.length > 0) {
      initTableResult("comments");
      console.log(`[ImportData] Importing ${tables.comments.count} comments...`);

      // First pass: import comments without parent_id, build mapping
      const commentIdMapping: Record<string, string> = {};
      const pendingReplies: any[] = [];

      for (const comment of tables.comments.data) {
        if (comment.parent_id) {
          pendingReplies.push(comment);
          continue;
        }

        try {
          const oldValidationId = comment.validation_id;
          const newValidationId = result.idMappings.validations[oldValidationId];

          if (!newValidationId) {
            result.tables.comments.skipped++;
            continue;
          }

          const newComment = {
            validation_id: newValidationId,
            content: comment.content,
            user_id: comment.is_ai ? null : user.id,
            is_ai: comment.is_ai || false,
            persona_id: comment.persona_id,
            likes_count: comment.likes_count || 0,
            created_at: comment.created_at,
          };

          const { data: inserted, error } = await supabaseAdmin
            .from("comments")
            .insert(newComment)
            .select("id")
            .single();

          if (error) {
            result.tables.comments.errors.push(`Comment: ${error.message}`);
            result.tables.comments.skipped++;
          } else {
            commentIdMapping[comment.id] = inserted.id;
            result.tables.comments.imported++;
          }
        } catch (e) {
          result.tables.comments.skipped++;
        }
      }

      // Second pass: import replies with mapped parent_id
      for (const reply of pendingReplies) {
        try {
          const newValidationId = result.idMappings.validations[reply.validation_id];
          const newParentId = commentIdMapping[reply.parent_id];

          if (!newValidationId || !newParentId) {
            result.tables.comments.skipped++;
            continue;
          }

          const newReply = {
            validation_id: newValidationId,
            parent_id: newParentId,
            content: reply.content,
            user_id: reply.is_ai ? null : user.id,
            is_ai: reply.is_ai || false,
            persona_id: reply.persona_id,
            likes_count: reply.likes_count || 0,
            created_at: reply.created_at,
          };

          const { error } = await supabaseAdmin.from("comments").insert(newReply);

          if (error) {
            result.tables.comments.skipped++;
          } else {
            result.tables.comments.imported++;
          }
        } catch (e) {
          result.tables.comments.skipped++;
        }
      }
      console.log(`[ImportData] Comments: ${result.tables.comments.imported} imported`);
    }

    // 4. Import trending_topics
    if (tables.trending_topics?.data?.length > 0) {
      initTableResult("trending_topics");
      console.log(`[ImportData] Importing ${tables.trending_topics.count} trending topics...`);

      for (const topic of tables.trending_topics.data) {
        try {
          const oldId = topic.id;
          
          // Check if keyword already exists
          const { data: existing } = await supabaseAdmin
            .from("trending_topics")
            .select("id")
            .eq("keyword", topic.keyword)
            .maybeSingle();

          if (existing) {
            result.idMappings.trending_topics[oldId] = existing.id;
            result.tables.trending_topics.skipped++;
            continue;
          }

          const newTopic = {
            keyword: topic.keyword,
            category: topic.category,
            heat_score: topic.heat_score || 0,
            growth_rate: topic.growth_rate,
            sample_count: topic.sample_count || 0,
            avg_engagement: topic.avg_engagement,
            sentiment_positive: topic.sentiment_positive,
            sentiment_negative: topic.sentiment_negative,
            sentiment_neutral: topic.sentiment_neutral,
            top_pain_points: topic.top_pain_points || [],
            related_keywords: topic.related_keywords || [],
            sources: topic.sources,
            validation_count: topic.validation_count || 0,
            avg_validation_score: topic.avg_validation_score,
            quality_score: topic.quality_score || 0,
            confidence_level: topic.confidence_level,
            source_type: topic.source_type || "user_validation",
            is_active: true,
            created_by: user.id,
            discovered_at: topic.discovered_at,
            updated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          };

          const { data: inserted, error } = await supabaseAdmin
            .from("trending_topics")
            .insert(newTopic)
            .select("id")
            .single();

          if (error) {
            result.tables.trending_topics.errors.push(`Topic ${topic.keyword}: ${error.message}`);
            result.tables.trending_topics.skipped++;
          } else {
            result.idMappings.trending_topics[oldId] = inserted.id;
            result.tables.trending_topics.imported++;
          }
        } catch (e) {
          result.tables.trending_topics.skipped++;
        }
      }
      console.log(`[ImportData] Topics: ${result.tables.trending_topics.imported} imported`);
    }

    // 5. Import user_topic_interests (requires topic ID mapping)
    if (tables.user_topic_interests?.data?.length > 0) {
      initTableResult("user_topic_interests");

      for (const interest of tables.user_topic_interests.data) {
        try {
          const newTopicId = result.idMappings.trending_topics[interest.topic_id];
          if (!newTopicId) {
            result.tables.user_topic_interests.skipped++;
            continue;
          }

          const { error } = await supabaseAdmin
            .from("user_topic_interests")
            .insert({
              topic_id: newTopicId,
              user_id: user.id,
              interest_type: interest.interest_type,
              created_at: interest.created_at,
            });

          if (error) {
            result.tables.user_topic_interests.skipped++;
          } else {
            result.tables.user_topic_interests.imported++;
          }
        } catch (e) {
          result.tables.user_topic_interests.skipped++;
        }
      }
    }

    // 6. Import scan_jobs
    if (tables.scan_jobs?.data?.length > 0) {
      initTableResult("scan_jobs");

      for (const job of tables.scan_jobs.data) {
        try {
          const { error } = await supabaseAdmin
            .from("scan_jobs")
            .insert({
              keywords: job.keywords || [],
              platforms: job.platforms || ["xiaohongshu"],
              frequency: job.frequency || "daily",
              status: "active",
              signals_found: 0,
              created_by: user.id,
              created_at: job.created_at,
            });

          if (error) {
            result.tables.scan_jobs.skipped++;
          } else {
            result.tables.scan_jobs.imported++;
          }
        } catch (e) {
          result.tables.scan_jobs.skipped++;
        }
      }
    }

    // 7. Import mvp_landing_pages
    if (tables.mvp_landing_pages?.data?.length > 0) {
      initTableResult("mvp_landing_pages");

      for (const page of tables.mvp_landing_pages.data) {
        try {
          const oldId = page.id;
          const newValidationId = page.validation_id 
            ? result.idMappings.validations[page.validation_id] 
            : null;

          // Generate new unique slug
          const newSlug = `${page.slug}-${Date.now().toString(36)}`;

          const { data: inserted, error } = await supabaseAdmin
            .from("mvp_landing_pages")
            .insert({
              slug: newSlug,
              content: page.content,
              theme: page.theme || "default",
              is_published: false, // Start unpublished in new project
              view_count: 0,
              user_id: user.id,
              validation_id: newValidationId,
              created_at: page.created_at,
            })
            .select("id")
            .single();

          if (error) {
            result.tables.mvp_landing_pages.errors.push(`Page ${page.slug}: ${error.message}`);
            result.tables.mvp_landing_pages.skipped++;
          } else {
            result.idMappings.mvp_landing_pages[oldId] = inserted.id;
            result.tables.mvp_landing_pages.imported++;
          }
        } catch (e) {
          result.tables.mvp_landing_pages.skipped++;
        }
      }
    }

    // 8. Import mvp_leads (requires landing page ID mapping)
    if (tables.mvp_leads?.data?.length > 0) {
      initTableResult("mvp_leads");

      for (const lead of tables.mvp_leads.data) {
        try {
          const newPageId = result.idMappings.mvp_landing_pages[lead.landing_page_id];
          if (!newPageId) {
            result.tables.mvp_leads.skipped++;
            continue;
          }

          const { error } = await supabaseAdmin
            .from("mvp_leads")
            .insert({
              landing_page_id: newPageId,
              email: lead.email,
              metadata: lead.metadata,
              created_at: lead.created_at,
            });

          if (error) {
            result.tables.mvp_leads.skipped++;
          } else {
            result.tables.mvp_leads.imported++;
          }
        } catch (e) {
          result.tables.mvp_leads.skipped++;
        }
      }
    }

    // Calculate summary
    for (const tableName in result.tables) {
      result.summary.totalImported += result.tables[tableName].imported;
      result.summary.totalSkipped += result.tables[tableName].skipped;
      result.summary.totalErrors += result.tables[tableName].errors.length;
    }

    console.log(`[ImportData] Import complete: ${result.summary.totalImported} imported, ${result.summary.totalSkipped} skipped`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[ImportData] Error:", error);
    const message = error instanceof Error ? error.message : "Import failed";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
