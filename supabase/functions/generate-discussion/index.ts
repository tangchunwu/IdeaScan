import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  validateUUID,
  validateString,
  validateUserProvidedUrl,
  sanitizeForPrompt,
  ValidationError,
  createErrorResponse,
  LIMITS 
} from "../_shared/validation.ts";
import { checkRateLimit, RateLimitError, createRateLimitResponse } from "../_shared/rate-limit.ts";
import { requestChatCompletion, extractAssistantContent } from "../_shared/llm-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Persona {
  id: string;
  name: string;
  role: string;
  system_prompt: string;
  personality?: string;
  focus_areas?: string[];
  catchphrase?: string;
  avatar_url?: string;
}

interface SafePersona {
  id: string;
  name: string;
  role: string;
  personality?: string;
  focus_areas?: string[];
  catchphrase?: string;
  avatar_url?: string;
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

interface LLMCandidate {
  baseUrl: string;
  apiKey: string;
  model: string;
  label: string;
}

function stripSystemPrompt(persona: Persona): SafePersona {
  const { system_prompt: _, ...safe } = persona;
  return safe;
}

function buildLLMCandidates(config?: { llmApiKey?: string; llmBaseUrl?: string; llmModel?: string }): LLMCandidate[] {
  const candidates: LLMCandidate[] = [];
  
  // 1. User custom config (if provided) - skip default api.openai.com URLs
  const frontendUrlIsDefault = /api\.openai\.com/i.test(config?.llmBaseUrl || "");
  if (config?.llmApiKey && !frontendUrlIsDefault) {
    candidates.push({
      baseUrl: config.llmBaseUrl || "https://ai.gateway.lovable.dev/v1",
      apiKey: config.llmApiKey,
      model: config.llmModel || "google/gemini-3-flash-preview",
      label: "custom",
    });
  }

  // 2. Server-configured LLM (env vars)
  const envKey = Deno.env.get("LLM_API_KEY");
  const envBase = Deno.env.get("LLM_BASE_URL");
  if (envKey && envBase) {
    const envModel = Deno.env.get("LLM_MODEL") || "google/gemini-3-flash-preview";
    // Avoid duplicate if same as custom
    if (envKey !== config?.llmApiKey || envBase !== config?.llmBaseUrl) {
      candidates.push({
        baseUrl: envBase,
        apiKey: envKey,
        model: envModel,
        label: "server",
      });
    }
  }

  // 3. Lovable AI fallback (always available)
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    candidates.push({
      baseUrl: "https://ai.gateway.lovable.dev/v1",
      apiKey: lovableKey,
      model: "google/gemini-3-flash-preview",
      label: "lovable",
    });
  }

  return candidates;
}

async function generateWithFallback(
  candidates: LLMCandidate[],
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.8,
  maxTokens = 400,
): Promise<{ content: string; provider: string; warnings: string[] }> {
  const warnings: string[] = [];

  for (const candidate of candidates) {
    try {
      const result = await requestChatCompletion({
        baseUrl: candidate.baseUrl,
        apiKey: candidate.apiKey,
        model: candidate.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
        maxTokens,
        timeoutMs: 30000,
      });

      const content = extractAssistantContent(result.json).trim();
      if (!content) {
        warnings.push(`${candidate.label}: empty response`);
        continue;
      }

      return { content, provider: candidate.label, warnings };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`LLM candidate ${candidate.label} failed:`, msg.slice(0, 200));
      warnings.push(`${candidate.label}: ${msg.slice(0, 100)}`);
    }
  }

  throw new Error("all_llm_candidates_failed");
}

function cleanCommentContent(content: string, personaName: string): string {
  // Strip <think>...</think> reasoning blocks (closed and unclosed)
  let cleaned = content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*/gi, "")
    .trim();

  // Remove "[名字]:" or "名字:" prefix
  cleaned = cleaned
    .replace(new RegExp(`^\\[?${personaName}\\]?[:：]\\s*`, 'i'), '')
    .replace(/^\[.*?\][:：]\s*/, '')
    .trim();
  
  // Strip reasoning preamble lines (e.g. "让我分析这个创业项目，用...的视角来评价。")
  cleaned = cleaned
    .replace(/^让我[^\n]*?来[^\n]*?[。\.]\n*/i, '')
    .replace(/^从[^\n]*?角度[^\n]*?[：:]\n*/i, '')
    .trim();

  // Normalize whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned || content;
}

function buildRoleContextPrompt(persona: Persona, data: ValidationData): string {
  const sanitizedIdea = sanitizeForPrompt(data.idea);
  const sanitizedTags = data.tags.map(t => sanitizeForPrompt(t));
  const report = data.report;
  const dims = data.dimensions;

  let ctx = `你正在评估一个创业想法：
- 创意: "${sanitizedIdea}"
- 标签: ${sanitizedTags.join(", ")}
- 总分: ${data.overall_score}/100
`;

  if (dims && dims.length > 0) {
    ctx += `\n📊 维度评分:\n`;
    for (const d of dims) {
      ctx += `  - ${d.dimension}: ${d.score}/100\n`;
    }
  }

  const role = persona.role;

  if (role.includes('VC') || role.includes('合伙人')) {
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
  } else if (role.includes('用户') || role.includes('可可')) {
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
    if (dims) {
      const feasibility = dims.find(d => d.dimension.includes('可行') || d.dimension.includes('feasibility'));
      if (feasibility) ctx += `\n🔧 可行性得分: ${feasibility.score}/100\n`;
    }
  } else if (role.includes('分析') || role.includes('老王')) {
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    const validationId = validateUUID(body.validation_id, "validation_id");
    
    const config = body.config && typeof body.config === "object" ? {
      llmApiKey: validateString(body.config.llmApiKey, "llmApiKey", LIMITS.API_KEY_MAX_LENGTH) || undefined,
      llmBaseUrl: validateUserProvidedUrl(body.config.llmBaseUrl, "llmBaseUrl") || undefined,
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

    // Fetch validation, report, personas in parallel
    const [validationResult, reportResult, personasResult] = await Promise.all([
      supabase.from("validations").select("*").eq("id", validationId).eq("user_id", user.id).single(),
      supabase.from("validation_reports").select("*").eq("validation_id", validationId).single(),
      supabase.from("personas").select("*").eq("is_active", true),
    ]);

    const validation = validationResult.data;
    if (validationResult.error || !validation) throw new ValidationError("Validation not found or access denied");

    const report = reportResult.data;
    const personas = personasResult.data as Persona[];
    if (personasResult.error || !personas || personas.length === 0) throw new Error("No personas configured");

    const validationData: ValidationData = {
      idea: validation.idea,
      tags: validation.tags || [],
      overall_score: validation.overall_score || 50,
      dimensions: report?.dimensions as ValidationData['dimensions'] || undefined,
      report: report ? {
        market_analysis: (report as any).market_analysis || undefined,
        ai_analysis: (report as any).ai_analysis || undefined,
        sentiment_analysis: (report as any).sentiment_analysis || undefined,
        competitor_data: (report as any).competitor_data || undefined,
      } : undefined,
    };

    const candidates = buildLLMCandidates(config);
    if (candidates.length === 0) throw new Error("No LLM provider available");

    console.log(`Generating comments for ${personas.length} personas with ${candidates.length} LLM candidates...`);

    let fallbackUsed = false;
    const allWarnings: string[] = [];
    const successfulComments: any[] = [];
    const failedPersonas: string[] = [];

    // Generate comments for each persona
    for (const persona of personas) {
      try {
        const contextPrompt = buildRoleContextPrompt(persona, validationData);
        const result = await generateWithFallback(candidates, persona.system_prompt, contextPrompt);

        if (result.provider !== "custom" && config?.llmApiKey) {
          fallbackUsed = true;
        }
        if (result.warnings.length > 0) {
          allWarnings.push(...result.warnings);
        }

        const cleanedContent = cleanCommentContent(result.content, persona.name);

        const { data: comment, error: insertError } = await supabase
          .from("comments")
          .insert({
            validation_id: validationId,
            persona_id: persona.id,
            content: cleanedContent,
            is_ai: true,
          })
          .select()
          .single();

        if (insertError) {
          console.error(`Failed to insert comment for ${persona.name}:`, insertError);
          failedPersonas.push(persona.name);
          continue;
        }

        successfulComments.push({ ...comment, persona: stripSystemPrompt(persona) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`All LLM candidates failed for ${persona.name}:`, msg);
        failedPersonas.push(persona.name);
        allWarnings.push(`${persona.name}: ${msg.slice(0, 100)}`);
      }
    }

    // If ALL personas failed, return error (don't insert garbage)
    if (successfulComments.length === 0) {
      return new Response(
        JSON.stringify({
          error: "所有 AI 模型均不可用，请检查自定义模型配置或稍后重试。",
          details: allWarnings.slice(0, 5),
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Generated ${successfulComments.length} comments, ${failedPersonas.length} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        comments: successfulComments,
        meta: {
          fallbackUsed,
          failedPersonas,
          warnings: allWarnings.length > 0 ? allWarnings.slice(0, 5) : undefined,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    if (error instanceof RateLimitError) {
      return createRateLimitResponse(error, corsHeaders);
    }
    return createErrorResponse(error, corsHeaders);
  }
});
