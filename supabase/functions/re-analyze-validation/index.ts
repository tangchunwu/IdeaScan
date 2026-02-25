import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const LOVABLE_API_URL = "https://api.lovable.dev/v1";

interface ReAnalyzeRequest {
  validationId: string;
  config?: {
    llmProvider?: string;
    llmBaseUrl?: string;
    llmApiKey?: string;
    llmModel?: string;
  };
}

// Default dimension reasons for meaningful fallbacks
const defaultDimensionReasons: Record<string, string> = {
  "需求痛感": "基于用户反馈和市场调研的需求强度评估",
  "PMF潜力": "产品与市场匹配度的综合分析",
  "市场规模": "目标市场容量和增长趋势评估",
  "差异化": "与竞品的差异化程度分析",
  "可行性": "技术和商业实现的可行性评估",
  "盈利能力": "商业模式和盈利潜力分析",
  "护城河": "竞争优势和可持续性分析",
  "商业模式": "商业模式的可行性和盈利评估",
  "技术可行性": "技术实现难度和资源需求",
  "创新程度": "创新性和市场差异化程度"
};

// Check if persona data is incomplete
function isPersonaIncomplete(persona: any): boolean {
  if (!persona) return true;
  if (!persona.name || !persona.role) return true;
  if (!Array.isArray(persona.painPoints) || persona.painPoints.length === 0) return true;
  if (!Array.isArray(persona.goals) || persona.goals.length === 0) return true;
  if (!persona.description || persona.description.includes("分析中")) return true;
  return false;
}

// Check if AI analysis data is incomplete
function isAiAnalysisIncomplete(ai: any): boolean {
  if (!ai) return true;
  if (!ai.overallVerdict || ai.overallVerdict.includes("综合评估中") || ai.overallVerdict.includes("正在生成")) return true;
  if (!Array.isArray(ai.strengths) || ai.strengths.length === 0) return true;
  if (!Array.isArray(ai.weaknesses) || ai.weaknesses.length === 0) return true;
  return false;
}

// Check if dimensions data is incomplete
function isDimensionsIncomplete(dimensions: any[]): boolean {
  if (!Array.isArray(dimensions) || dimensions.length === 0) return true;
  
  // Check if any dimension has placeholder reason
  return dimensions.some(d => 
    !d.reason || 
    d.reason === "待AI分析" || 
    d.reason.includes("数据加载中") ||
    d.reason.length < 10
  );
}

// Call AI to regenerate missing data
async function regenerateMissingData(
  idea: string,
  existingReport: any,
  needsPersona: boolean,
  needsDimensions: boolean,
  needsAiAnalysis: boolean,
  config?: ReAnalyzeRequest['config']
): Promise<{ persona?: any; dimensions?: any[]; aiAnalysis?: any }> {
  
  const existingContext = {
    marketAnalysis: existingReport.market_analysis || {},
    xiaohongshuData: existingReport.xiaohongshu_data || {},
    competitorData: existingReport.competitor_data || [],
    existingDimensions: existingReport.dimensions || [],
  };

  // Build prompt based on what's needed
  let prompt = `你是一位资深的需求验证专家。请基于以下创业想法和已有数据，`;
  
  const tasks: string[] = [];
  if (needsPersona) tasks.push("生成详细的目标用户画像");
  if (needsDimensions) tasks.push("为每个评估维度提供详细的分析理由");
  if (needsAiAnalysis) tasks.push("生成综合分析结论（包含一句话总结、优势、劣势和建议）");
  
  prompt += tasks.join("并") + "。\n\n";
  prompt += `## 创业想法\n${idea}\n\n`;
  
  if (Object.keys(existingContext.marketAnalysis).length > 0) {
    prompt += `## 已有市场分析\n${JSON.stringify(existingContext.marketAnalysis, null, 2)}\n\n`;
  }
  
  if (existingContext.xiaohongshuData.totalNotes > 0) {
    prompt += `## 小红书数据\n- 相关笔记数: ${existingContext.xiaohongshuData.totalNotes}\n- 平均点赞: ${existingContext.xiaohongshuData.avgLikes}\n\n`;
  }

  prompt += `## 输出要求\n请以JSON格式输出，包含以下字段：\n`;
  
  if (needsPersona) {
    prompt += `
**persona** (目标用户画像):
{
  "name": "用户画像名称（如：职场新人小王）",
  "role": "职业/身份（如：互联网产品经理）",
  "age": "年龄范围（如：25-35岁）",
  "income": "收入水平（如：月薪15-25k）",
  "painPoints": ["痛点1", "痛点2", "痛点3"],
  "goals": ["目标1", "目标2", "目标3"],
  "techSavviness": 75,
  "spendingCapacity": 65,
  "description": "一段描述这个用户的故事，包括他们的日常场景和为什么需要这个产品（100-150字）"
}
`;
  }
  
  if (needsDimensions) {
    const dimensionNames = existingContext.existingDimensions.map((d: any) => d.dimension);
    prompt += `
**dimensions** (评估维度分析):
为以下每个维度提供50-100字的详细分析理由：
${dimensionNames.map((name: string, i: number) => `- ${name}: 当前得分 ${existingContext.existingDimensions[i]?.score || 50}`).join('\n')}

格式:
[
  { "dimension": "维度名称", "score": 分数, "reason": "详细分析理由..." },
  ...
]
`;
  }

  if (needsAiAnalysis) {
    prompt += `
**aiAnalysis** (综合分析结论):
{
  "overallVerdict": "一句话总结这个创业想法的可行性和前景（50-80字，直接给出结论性判断）",
  "strengths": ["优势1（15-30字）", "优势2", "优势3"],
  "weaknesses": ["劣势/风险1（15-30字）", "劣势2", "劣势3"],
  "suggestions": ["建议1（15-30字）", "建议2", "建议3"],
  "risks": ["风险1（15-30字）", "风险2"]
}
`;
  }

  prompt += `\n请确保输出是有效的JSON格式。`;

  // Call AI API
  let apiUrl: string;
  let apiKey: string;
  let model: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;

  // Skip default api.openai.com URL, prefer system env vars
  const frontendUrlIsDefault = /api\.openai\.com/i.test(config?.llmBaseUrl || "");
  const hasCustomLLM = config?.llmApiKey && config?.llmBaseUrl && !frontendUrlIsDefault;

  // Try system env vars first if frontend is default
  const envKey = Deno.env.get("LLM_API_KEY");
  const envBase = Deno.env.get("LLM_BASE_URL");
  const envModel = Deno.env.get("LLM_MODEL");

  if (hasCustomLLM) {
    // Use custom LLM
    apiUrl = `${config.llmBaseUrl}/chat/completions`;
    apiKey = config.llmApiKey!;
    model = config.llmModel || "gpt-4o-mini";
    headers = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    };
    body = {
      model,
      messages: [
        { role: "system", content: "你是一位资深的需求验证和用户研究专家。请用中文回答。" },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    };
  } else if (envKey && envBase) {
    // Use system-configured LLM
    const cleanBase = envBase.replace(/\/$/, "").replace(/\/chat\/completions$/i, "");
    apiUrl = `${cleanBase}/chat/completions`;
    apiKey = envKey;
    model = envModel || "google/gemini-3-flash-preview";
    headers = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    };
    body = {
      model,
      messages: [
        { role: "system", content: "你是一位资深的需求验证和用户研究专家。请用中文回答。" },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    };
  } else if (LOVABLE_API_KEY) {
    // Use Lovable AI
    apiUrl = `${LOVABLE_API_URL}/chat/completions`;
    apiKey = LOVABLE_API_KEY;
    model = "google/gemini-2.5-flash";
    headers = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    };
    body = {
      model,
      messages: [
        { role: "system", content: "你是一位资深的需求验证和用户研究专家。请用中文回答。" },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    };
  } else {
    throw new Error("No AI provider configured");
  }

  console.log(`[Re-analyze] Calling AI to regenerate: persona=${needsPersona}, dimensions=${needsDimensions}`);

  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Re-analyze] AI API error:", errorText);
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  
  console.log("[Re-analyze] AI response length:", content.length);

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[Re-analyze] No JSON found in response");
    throw new Error("Invalid AI response format");
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      persona: needsPersona ? parsed.persona : undefined,
      dimensions: needsDimensions ? parsed.dimensions : undefined,
      aiAnalysis: needsAiAnalysis ? parsed.aiAnalysis : undefined,
    };
  } catch (e) {
    console.error("[Re-analyze] JSON parse error:", e);
    throw new Error("Failed to parse AI response");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { validationId, config } = await req.json() as ReAnalyzeRequest;

    if (!validationId) {
      return new Response(
        JSON.stringify({ error: "validationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch existing validation
    const { data: validation, error: validationError } = await supabase
      .from("validations")
      .select("*")
      .eq("id", validationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (validationError || !validation) {
      return new Response(
        JSON.stringify({ error: "Validation not found or access denied" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch existing report
    const { data: report, error: reportError } = await supabase
      .from("validation_reports")
      .select("*")
      .eq("validation_id", validationId)
      .maybeSingle();

    if (reportError || !report) {
      return new Response(
        JSON.stringify({ error: "Report not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check what needs regeneration
    const needsPersona = isPersonaIncomplete(report.persona);
    const needsDimensions = isDimensionsIncomplete(report.dimensions as any[]);
    const needsAiAnalysis = isAiAnalysisIncomplete(report.ai_analysis);

    console.log(`[Re-analyze] Validation: ${validationId}`);
    console.log(`[Re-analyze] Needs persona: ${needsPersona}, Needs dimensions: ${needsDimensions}, Needs aiAnalysis: ${needsAiAnalysis}`);

    if (!needsPersona && !needsDimensions && !needsAiAnalysis) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "数据已完整，无需重新分析",
          updated: false 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Regenerate missing data
    const regenerated = await regenerateMissingData(
      validation.idea,
      report,
      needsPersona,
      needsDimensions,
      needsAiAnalysis,
      config
    );

    // Prepare update data
    const updateData: Record<string, unknown> = {};

    if (regenerated.persona && needsPersona) {
      updateData.persona = regenerated.persona;
      console.log("[Re-analyze] Updating persona");
    }

    if (regenerated.aiAnalysis && needsAiAnalysis) {
      // Merge with existing ai_analysis, preserving feasibilityScore
      const existingAi = (report.ai_analysis || {}) as Record<string, unknown>;
      updateData.ai_analysis = {
        ...existingAi,
        overallVerdict: regenerated.aiAnalysis.overallVerdict || existingAi.overallVerdict,
        strengths: Array.isArray(regenerated.aiAnalysis.strengths) && regenerated.aiAnalysis.strengths.length > 0
          ? regenerated.aiAnalysis.strengths : existingAi.strengths,
        weaknesses: Array.isArray(regenerated.aiAnalysis.weaknesses) && regenerated.aiAnalysis.weaknesses.length > 0
          ? regenerated.aiAnalysis.weaknesses : existingAi.weaknesses,
        suggestions: Array.isArray(regenerated.aiAnalysis.suggestions) && regenerated.aiAnalysis.suggestions.length > 0
          ? regenerated.aiAnalysis.suggestions : existingAi.suggestions,
        risks: Array.isArray(regenerated.aiAnalysis.risks) && regenerated.aiAnalysis.risks.length > 0
          ? regenerated.aiAnalysis.risks : existingAi.risks,
      };
      console.log("[Re-analyze] Updating ai_analysis");
    }

    if (regenerated.dimensions && needsDimensions) {
      // Merge with existing dimensions (preserve scores, update reasons)
      const existingDimensions = (report.dimensions as any[]) || [];
      const newDimensions = regenerated.dimensions;

      updateData.dimensions = existingDimensions.map((existing: any) => {
        const updated = newDimensions.find((n: any) => n.dimension === existing.dimension);
        if (updated && updated.reason && updated.reason.length > 10) {
          return {
            ...existing,
            reason: updated.reason
          };
        }
        return {
          ...existing,
          reason: existing.reason && existing.reason !== "待AI分析" 
            ? existing.reason 
            : (defaultDimensionReasons[existing.dimension] || `基于市场数据对${existing.dimension}的综合评估`)
        };
      });
      console.log("[Re-analyze] Updating dimensions");
    }

    // Update report
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from("validation_reports")
        .update(updateData)
        .eq("id", report.id);

      if (updateError) {
        console.error("[Re-analyze] Update error:", updateError);
        throw new Error("Failed to update report");
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "分析数据已更新",
        updated: true,
        updatedFields: Object.keys(updateData)
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Re-analyze] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
