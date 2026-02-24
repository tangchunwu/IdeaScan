import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  validateUUID,
  validateString,
  validateBaseUrl,
  sanitizeForPrompt,
  ValidationError,
  createErrorResponse,
  LIMITS 
} from "../_shared/validation.ts";
import { checkRateLimit, RateLimitError, createRateLimitResponse } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Persona {
  id: string;
  name: string;
  role: string;
  system_prompt: string;
}

interface ValidationData {
  idea: string;
  tags: string[];
  overall_score: number;
  dimensions?: Array<{ dimension: string; score: number }>;
  report?: {
    market_analysis?: {
      targetAudience?: string;
      competitionLevel?: string;
      trendDirection?: string;
      marketSize?: string;
      keywords?: string[];
    };
    ai_analysis?: {
      strengths?: string[];
      weaknesses?: string[];
      risks?: string[];
      suggestions?: string[];
      feasibilityScore?: number;
    };
    sentiment_analysis?: {
      positive?: number;
      negative?: number;
      neutral?: number;
      topPositive?: string[];
      topNegative?: string[];
    };
    competitor_data?: Array<{ title: string; snippet: string }>;
  };
}

function buildRoleContextPrompt(persona: Persona, data: ValidationData): string {
  const sanitizedIdea = sanitizeForPrompt(data.idea);
  const sanitizedTags = data.tags.map(t => sanitizeForPrompt(t));
  const report = data.report;
  const dims = data.dimensions;

  // Base context
  let ctx = `你正在评估一个创业想法：
- 创意: "${sanitizedIdea}"
- 标签: ${sanitizedTags.join(", ")}
- 总分: ${data.overall_score}/100
`;

  // Dimensions summary
  if (dims && dims.length > 0) {
    ctx += `\n📊 维度评分:\n`;
    for (const d of dims) {
      ctx += `  - ${d.dimension}: ${d.score}/100\n`;
    }
  }

  const role = persona.role;

  // Role-specific context emphasis
  if (role.includes('VC') || role.includes('合伙人')) {
    // VC: focus on market demand, profit potential, risks, competition
    if (report?.market_analysis) {
      const ma = report.market_analysis;
      ctx += `\n🏛 市场分析:\n`;
      if (ma.competitionLevel) ctx += `  - 竞争程度: ${ma.competitionLevel}\n`;
      if (ma.trendDirection) ctx += `  - 趋势方向: ${ma.trendDirection}\n`;
      if (ma.marketSize) ctx += `  - 市场规模: ${ma.marketSize}\n`;
      if (ma.targetAudience) ctx += `  - 目标用户: ${ma.targetAudience}\n`;
    }
    if (report?.ai_analysis?.risks?.length) {
      ctx += `\n⚠️ 风险:\n${report.ai_analysis.risks.map(r => `  - ${sanitizeForPrompt(r)}`).join('\n')}\n`;
    }
    if (report?.competitor_data?.length) {
      ctx += `\n🏢 竞品 (${report.competitor_data.length}个):\n`;
      for (const c of report.competitor_data.slice(0, 3)) {
        ctx += `  - ${sanitizeForPrompt(c.title)}\n`;
      }
    }
  } else if (role.includes('产品') || role.includes('PM')) {
    // PM: focus on suggestions, strengths/weaknesses, target audience
    if (report?.ai_analysis) {
      const ai = report.ai_analysis;
      if (ai.strengths?.length) {
        ctx += `\n✅ 优势:\n${ai.strengths.map(s => `  - ${sanitizeForPrompt(s)}`).join('\n')}\n`;
      }
      if (ai.weaknesses?.length) {
        ctx += `\n❌ 劣势:\n${ai.weaknesses.map(w => `  - ${sanitizeForPrompt(w)}`).join('\n')}\n`;
      }
      if (ai.suggestions?.length) {
        ctx += `\n💡 建议:\n${ai.suggestions.map(s => `  - ${sanitizeForPrompt(s)}`).join('\n')}\n`;
      }
    }
    if (report?.market_analysis?.targetAudience) {
      ctx += `\n👤 目标用户: ${report.market_analysis.targetAudience}\n`;
    }
    if (report?.competitor_data?.length) {
      ctx += `\n🏢 竞品:\n`;
      for (const c of report.competitor_data.slice(0, 3)) {
        ctx += `  - ${sanitizeForPrompt(c.title)}: ${sanitizeForPrompt(c.snippet?.slice(0, 80) || '')}\n`;
      }
    }
  } else if (role.includes('用户') || role.includes('可可')) {
    // User rep: focus on sentiment, feasibility, user voice
    if (report?.sentiment_analysis) {
      const sa = report.sentiment_analysis;
      ctx += `\n😊 用户情绪:\n`;
      ctx += `  - 正面: ${sa.positive ?? 0}% | 负面: ${sa.negative ?? 0}% | 中性: ${sa.neutral ?? 0}%\n`;
      if (sa.topPositive?.length) {
        ctx += `  - 用户好评: "${sanitizeForPrompt(sa.topPositive.slice(0, 2).join('"; "'))}"\n`;
      }
      if (sa.topNegative?.length) {
        ctx += `  - 用户吐槽: "${sanitizeForPrompt(sa.topNegative.slice(0, 2).join('"; "'))}"\n`;
      }
    }
    // Feasibility dimension
    if (dims) {
      const feasibility = dims.find(d => d.dimension.includes('可行') || d.dimension.includes('feasibility'));
      if (feasibility) ctx += `\n🔧 可行性得分: ${feasibility.score}/100\n`;
    }
  } else if (role.includes('分析') || role.includes('老王')) {
    // Analyst: full picture - all dimensions, competitor, market, sentiment
    if (report?.market_analysis) {
      const ma = report.market_analysis;
      ctx += `\n🏛 市场分析:\n`;
      if (ma.competitionLevel) ctx += `  - 竞争程度: ${ma.competitionLevel}\n`;
      if (ma.trendDirection) ctx += `  - 趋势方向: ${ma.trendDirection}\n`;
      if (ma.marketSize) ctx += `  - 市场规模: ${ma.marketSize}\n`;
      if (ma.targetAudience) ctx += `  - 目标用户: ${ma.targetAudience}\n`;
    }
    if (report?.competitor_data?.length) {
      ctx += `\n🏢 竞品 (${report.competitor_data.length}个):\n`;
      for (const c of report.competitor_data.slice(0, 5)) {
        ctx += `  - ${sanitizeForPrompt(c.title)}\n`;
      }
    }
    if (report?.sentiment_analysis) {
      const sa = report.sentiment_analysis;
      ctx += `\n📈 社交媒体情绪: 正面${sa.positive ?? 0}% / 负面${sa.negative ?? 0}% / 中性${sa.neutral ?? 0}%\n`;
    }
    if (report?.ai_analysis?.risks?.length) {
      ctx += `\n⚠️ 风险: ${report.ai_analysis.risks.map(r => sanitizeForPrompt(r)).join('；')}\n`;
    }
  }

  ctx += `\n请用你的角色人设，对这个创意发表一条评论。
注意：直接输出评论内容，不要任何前缀或解释。`;

  return ctx;
}

async function generatePersonaComment(
  persona: Persona,
  validationData: ValidationData,
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<string> {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const contextPrompt = buildRoleContextPrompt(persona, validationData);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: persona.system_prompt },
        { role: "user", content: contextPrompt }
      ],
      temperature: 0.8,
      max_tokens: 400,
    }),
  });

  if (!response.ok) {
    console.error(`Persona ${persona.name} generation failed:`, await response.text());
    return `[${persona.name}]: 我需要更多信息才能评价这个想法。`;
  }

  const data = await response.json();
  return data.choices[0]?.message?.content?.trim() || `[${persona.name}]: 暂无评论。`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    const validationId = validateUUID(body.validation_id, "validation_id");
    
    const config = body.config && typeof body.config === "object" ? {
      llmApiKey: validateString(body.config.llmApiKey, "llmApiKey", LIMITS.API_KEY_MAX_LENGTH) || undefined,
      llmBaseUrl: validateBaseUrl(body.config.llmBaseUrl, "llmBaseUrl") || undefined,
      llmModel: validateString(body.config.llmModel, "llmModel", LIMITS.MODEL_MAX_LENGTH) || undefined,
    } : undefined;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new ValidationError("Authorization required");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new ValidationError("Invalid or expired session");

    await checkRateLimit(supabase, user.id, "generate-discussion");

    // Fetch validation and report in parallel
    const [validationResult, reportResult, personasResult] = await Promise.all([
      supabase.from("validations").select("*").eq("id", validationId).single(),
      supabase.from("validation_reports").select("*").eq("validation_id", validationId).single(),
      supabase.from("personas").select("*").eq("is_active", true),
    ]);

    const validation = validationResult.data;
    if (validationResult.error || !validation) throw new Error("Validation not found");

    const report = reportResult.data;
    const personas = personasResult.data;
    if (personasResult.error || !personas || personas.length === 0) throw new Error("No personas configured");

    // Build rich validation data
    const validationData: ValidationData = {
      idea: validation.idea,
      tags: validation.tags || [],
      overall_score: validation.overall_score || 50,
      dimensions: report?.dimensions as ValidationData['dimensions'] || undefined,
      // deno-lint-ignore no-explicit-any
      report: report ? {
        market_analysis: (report as any).market_analysis || undefined,
        ai_analysis: (report as any).ai_analysis || undefined,
        sentiment_analysis: (report as any).sentiment_analysis || undefined,
        competitor_data: (report as any).competitor_data || undefined,
      } : undefined,
    };

    const apiKey = config?.llmApiKey || Deno.env.get("LOVABLE_API_KEY") || "";
    const baseUrl = config?.llmBaseUrl || "https://ai.gateway.lovable.dev/v1";
    const model = config?.llmModel || "google/gemini-3-flash-preview";

    console.log(`Generating comments for ${personas.length} personas...`);

    const commentPromises = personas.map(async (persona: Persona) => {
      const content = await generatePersonaComment(persona, validationData, apiKey, baseUrl, model);

      const { data: comment, error: insertError } = await supabase
        .from("comments")
        .insert({
          validation_id: validationId,
          persona_id: persona.id,
          content: content,
          is_ai: true,
        })
        .select()
        .single();

      if (insertError) {
        console.error(`Failed to insert comment for ${persona.name}:`, insertError);
        return null;
      }

      return { ...comment, persona };
    });

    const comments = (await Promise.all(commentPromises)).filter(Boolean);
    console.log(`Generated ${comments.length} comments`);

    return new Response(
      JSON.stringify({ success: true, comments }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    if (error instanceof RateLimitError) {
      return createRateLimitResponse(error, corsHeaders);
    }
    return createErrorResponse(error, corsHeaders);
  }
});
