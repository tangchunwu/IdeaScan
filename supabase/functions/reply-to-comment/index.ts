import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  validateString, 
  validateUUID,
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

interface LLMCandidate {
  baseUrl: string;
  apiKey: string;
  model: string;
  label: string;
}

function stripSystemPrompt(persona: any): any {
  if (!persona) return persona;
  const { system_prompt: _, ...safe } = persona;
  return safe;
}

function buildLLMCandidates(config?: { llmApiKey?: string; llmBaseUrl?: string; llmModel?: string }): LLMCandidate[] {
  const candidates: LLMCandidate[] = [];
  
  if (config?.llmApiKey) {
    candidates.push({
      baseUrl: config.llmBaseUrl || "https://ai.gateway.lovable.dev/v1",
      apiKey: config.llmApiKey,
      model: config.llmModel || "google/gemini-3-flash-preview",
      label: "custom",
    });
  }

  const envKey = Deno.env.get("LLM_API_KEY");
  const envBase = Deno.env.get("LLM_BASE_URL");
  if (envKey && envBase) {
    const envModel = Deno.env.get("LLM_MODEL") || "google/gemini-3-flash-preview";
    if (envKey !== config?.llmApiKey || envBase !== config?.llmBaseUrl) {
      candidates.push({ baseUrl: envBase, apiKey: envKey, model: envModel, label: "server" });
    }
  }

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
  maxTokens = 250,
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
        timeoutMs: 25000,
      });

      const content = extractAssistantContent(result.json).trim();
      if (!content) {
        warnings.push(`${candidate.label}: empty response`);
        continue;
      }

      return { content, provider: candidate.label, warnings };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Reply LLM candidate ${candidate.label} failed:`, msg.slice(0, 200));
      warnings.push(`${candidate.label}: ${msg.slice(0, 100)}`);
    }
  }

  throw new Error("all_llm_candidates_failed");
}

function buildReportContext(report: any, persona: Persona): string {
  if (!report) return "";

  let ctx = "\n\n📋 报告数据参考（请在回复中引用具体数据来支撑你的观点）:\n";
  const role = persona.role;

  if (report.dimensions && Array.isArray(report.dimensions) && report.dimensions.length > 0) {
    ctx += `维度评分: ${report.dimensions.map((d: any) => `${d.dimension}:${d.score}`).join(', ')}\n`;
  }

  if (role.includes('VC') || role.includes('合伙人')) {
    if (report.ai_analysis?.risks?.length) {
      ctx += `风险: ${report.ai_analysis.risks.map((r: string) => sanitizeForPrompt(r)).join('；')}\n`;
    }
    if (report.market_analysis?.competitionLevel) {
      ctx += `竞争程度: ${report.market_analysis.competitionLevel}\n`;
    }
  } else if (role.includes('产品') || role.includes('PM')) {
    if (report.ai_analysis?.suggestions?.length) {
      ctx += `产品建议: ${report.ai_analysis.suggestions.map((s: string) => sanitizeForPrompt(s)).join('；')}\n`;
    }
    if (report.ai_analysis?.weaknesses?.length) {
      ctx += `劣势: ${report.ai_analysis.weaknesses.map((w: string) => sanitizeForPrompt(w)).join('；')}\n`;
    }
  } else if (role.includes('用户') || role.includes('可可')) {
    if (report.sentiment_analysis) {
      const sa = report.sentiment_analysis;
      ctx += `用户情绪: 正面${sa.positive ?? 0}% 负面${sa.negative ?? 0}%\n`;
      if (sa.topNegative?.length) {
        ctx += `用户吐槽: "${sa.topNegative.slice(0, 2).join('"; "')}"\n`;
      }
    }
  } else if (role.includes('分析') || role.includes('老王')) {
    if (report.market_analysis) {
      const ma = report.market_analysis;
      ctx += `市场: 竞争${ma.competitionLevel || '未知'}, 趋势${ma.trendDirection || '未知'}\n`;
    }
    if (report.competitor_data?.length) {
      ctx += `竞品数量: ${report.competitor_data.length}\n`;
    }
    if (report.sentiment_analysis) {
      ctx += `情绪面: 正面${report.sentiment_analysis.positive ?? 0}% 负面${report.sentiment_analysis.negative ?? 0}%\n`;
    }
  }

  return ctx;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    const commentId = validateUUID(body.comment_id, "comment_id");
    const userReply = validateString(body.user_reply, "user_reply", LIMITS.USER_REPLY_MAX_LENGTH, true)!;
    
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

    await checkRateLimit(supabase, user.id, "reply-to-comment");

    // Get the original AI comment
    const { data: originalComment, error: cError } = await supabase
      .from("comments")
      .select("*, persona:personas(*)")
      .eq("id", commentId)
      .single();

    if (cError || !originalComment) throw new Error("Comment not found");
    if (!originalComment.is_ai || !originalComment.persona) throw new ValidationError("Can only reply to AI comments");

    // Ownership check: verify the user owns this validation
    const { data: ownerCheck } = await supabase
      .from("validations")
      .select("id")
      .eq("id", originalComment.validation_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!ownerCheck) throw new ValidationError("Access denied: you don't own this validation");

    const persona: Persona = originalComment.persona;

    // Save user's reply first
    const { data: userComment, error: insertUserError } = await supabase
      .from("comments")
      .insert({
        validation_id: originalComment.validation_id,
        user_id: user.id,
        content: userReply,
        parent_id: commentId,
        is_ai: false,
      })
      .select()
      .single();

    if (insertUserError) {
      console.error("Failed to save user reply:", insertUserError);
      throw new Error("Failed to save reply");
    }

    // Get validation context and report data in parallel
    const [validationResult, reportResult, conversationResult] = await Promise.all([
      supabase.from("validations").select("*").eq("id", originalComment.validation_id).single(),
      supabase.from("validation_reports").select("*").eq("validation_id", originalComment.validation_id).single(),
      supabase.from("comments")
        .select("content, is_ai, persona:personas(name)")
        .eq("validation_id", originalComment.validation_id)
        .or(`id.eq.${commentId},parent_id.eq.${commentId}`)
        .order("created_at", { ascending: true }),
    ]);

    const validation = validationResult.data;
    const report = reportResult.data;
    const conversationHistory = conversationResult.data || [];

    const historyText = conversationHistory
      .map((c: any) => `${c.is_ai ? c.persona?.name || 'AI' : '用户'}: ${sanitizeForPrompt(c.content)}`)
      .join("\n");

    const userReplies = conversationHistory.filter((c: any) => !c.is_ai).length;
    const attitudeHint = userReplies >= 3
      ? "\n🔄 用户已经进行了多轮有力回复，你可以适当软化态度，表现出被部分说服的样子，但仍然保持你的核心关注点。"
      : "";

    const reportContext = buildReportContext(report, persona);
    const candidates = buildLLMCandidates(config);
    if (candidates.length === 0) throw new Error("No LLM provider available");

    const sanitizedIdea = sanitizeForPrompt(validation?.idea || '未知');
    const sanitizedReply = sanitizeForPrompt(userReply);

    const prompt = `你正在讨论一个创业想法: "${sanitizedIdea}"（总分: ${validation?.overall_score || '未知'}/100）

对话历史:
${historyText}

用户刚刚回复了你: "${sanitizedReply}"
${reportContext}${attitudeHint}

请用你的角色人设继续对话。回复要求：
1. 必须引用至少一个具体数据点（维度分数、情绪比例、竞品等）来支撑你的回复
2. 如果用户提出了有力的新观点或论据，适当认可并在此基础上深入讨论
3. 如果用户的回复回避了你之前提出的核心问题，要追问并指出
4. 保持你的角色性格和专业视角
5. 可以提及其他角色可能会怎么看这个问题（如"产品阿强可能会说..."）

直接输出回复内容，不要任何前缀。控制在150字以内。`;

    let fallbackUsed = false;
    const result = await generateWithFallback(candidates, persona.system_prompt, prompt);
    if (result.provider !== "custom" && config?.llmApiKey) {
      fallbackUsed = true;
    }

    // Clean <think> blocks and reasoning artifacts from AI output
    const aiReplyContent = result.content
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<think>[\s\S]*/gi, "")
      .trim();

    // Save AI reply
    const { data: aiReply, error: insertAiError } = await supabase
      .from("comments")
      .insert({
        validation_id: originalComment.validation_id,
        persona_id: persona.id,
        content: aiReplyContent,
        parent_id: userComment.id,
        is_ai: true,
      })
      .select("*, persona:personas(id, name, role, avatar_url, personality, focus_areas, catchphrase, is_active, created_at)")
      .single();

    if (insertAiError) {
      console.error("Failed to save AI reply:", insertAiError);
      throw new Error("Failed to save AI response");
    }

    return new Response(
      JSON.stringify({
        success: true,
        userComment,
        aiReply,
        meta: {
          fallbackUsed,
          warnings: result.warnings.length > 0 ? result.warnings.slice(0, 3) : undefined,
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
