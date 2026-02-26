import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  validateString, 
  validateSearchProvider,
  validateConfigType,
  ValidationError,
  LIMITS
} from "../_shared/validation.ts";
import { requestChatCompletion, extractAssistantContent, normalizeLlmBaseUrl } from "../_shared/llm-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function stripCodeFence(input: string) {
  return String(input || "").replace(/```json/gi, "```").replace(/```/g, "").trim();
}

function extractFirstBalancedJsonObject(input: string): string {
  const text = String(input || "");
  const start = text.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return "";
}

function parseModelJsonLoose(content: string): any {
  const raw = stripCodeFence(content);
  const candidate = extractFirstBalancedJsonObject(raw);
  if (!candidate) throw new Error("no_json_object_in_content");
  try {
    return JSON.parse(candidate);
  } catch {
    const repaired = candidate
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
      .replace(/,\s*([}\]])/g, "$1")
      .trim();
    return JSON.parse(repaired);
  }
}

/**
 * Validate URL format (without domain restriction for verify-config)
 * This is less restrictive since verify-config is just a test call
 */
function validateUrlFormat(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  
  const str = validateString(value, fieldName, LIMITS.URL_MAX_LENGTH);
  if (!str) return null;
  
  try {
    const parsed = new URL(str);
    // Only allow https for security
    if (parsed.protocol !== "https:") {
      throw new ValidationError(`${fieldName} must use HTTPS`);
    }
    return str;
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw new ValidationError(`${fieldName} must be a valid URL`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // Validate inputs
    const type = validateConfigType(body.type);
    const apiKey = validateString(body.apiKey, "apiKey", LIMITS.API_KEY_MAX_LENGTH, true)!;
    const provider = body.provider ? validateSearchProvider(body.provider) : null;
    const model = validateString(body.model, "model", LIMITS.MODEL_MAX_LENGTH) || undefined;
    
    // For LLM/image_gen, validate URL format (but allow any HTTPS domain)
    let baseUrl: string | undefined;
    if (type === 'llm' || type === 'image_gen') {
      baseUrl = validateUrlFormat(body.baseUrl, "baseUrl") || undefined;
    }

    let isValid = false;
    let message = "Configuration verification failed";

    if (type === 'llm') {
      try {
        const cleanBaseUrl = normalizeLlmBaseUrl(baseUrl || Deno.env.get("LLM_BASE_URL") || "https://ai.gateway.lovable.dev/v1");
        const timeoutMs = 45000;
        const probePrompt = `你是创业分析助手。请基于以下简短样本给出严格JSON，不能输出额外文本。

想法: AI辅助健身计划
样本:
- 用户反馈希望自动生成每日训练计划
- 竞品较多，需要差异化定位

输出JSON:
{
  "overallScore": 0-100,
  "overallVerdict": "一句话",
  "marketAnalysis": {"targetAudience":"", "marketSize":"", "competitionLevel":""},
  "sentimentAnalysis": {"positive": 33, "neutral": 34, "negative": 33},
  "aiAnalysis": {"feasibilityScore": 0-100, "strengths": ["", ""], "weaknesses": ["", ""], "risks": ["", ""], "suggestions": ["", ""]},
  "persona": {"name":"", "role":"", "age":"", "painPoints":[""], "goals":[""]},
  "dimensions": [{"dimension":"需求痛感","score":50,"reason":""}]
}`;

        const completion = await requestChatCompletion({
          baseUrl: cleanBaseUrl,
          apiKey,
          model: model || "gpt-3.5-turbo",
          messages: [{ role: "user", content: probePrompt }],
          temperature: 0.2,
          maxTokens: 700,
          timeoutMs,
          responseFormat: { type: "json_object" },
        });

        const content = extractAssistantContent(completion.json);
        const obj = parseModelJsonLoose(String(content));
        const hasUsefulShape =
          (typeof obj?.overallScore === "number") ||
          (typeof obj?.aiAnalysis?.feasibilityScore === "number") ||
          (obj && typeof obj === "object" && Object.keys(obj).length > 0);
        if (!hasUsefulShape) {
          throw new Error("json_schema_too_empty");
        }
        isValid = true;
        message = "LLM deep verification successful (schema-compatible)";
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        isValid = false;
        if (msg.includes("timeout")) {
          message = "LLM deep verification timeout (long prompt). Gateway/model response too slow.";
        } else if (msg.includes("Unexpected token '<'") || msg.includes("invalid_json_response") || msg.includes("text/html")) {
          message = "LLM endpoint returned non-JSON payload (likely HTML challenge or wrong route).";
        } else if (msg.includes("llm_all_endpoints_failed")) {
          message = "LLM endpoint unreachable on expected OpenAI routes (/chat/completions or /v1/chat/completions).";
        } else if (msg.includes("no_json_object_in_content") || msg.includes("json_schema_too_empty")) {
          message = "LLM responded but not in required JSON format for analysis.";
        } else {
          message = `LLM deep verification failed: ${msg.slice(0, 120)}`;
        }
      }
    } else if (type === 'image_gen') {
      try {
        let cleanBaseUrl = (baseUrl || Deno.env.get("IMAGE_GEN_BASE_URL") || "https://ai.gateway.lovable.dev/v1").replace(/\/$/, "");
        const endpoint = `${cleanBaseUrl}/models`;

        const res = await fetch(endpoint, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          }
        });

        if (res.ok) {
          isValid = true;
          message = "Image generation API connection successful";
        } else {
          isValid = false;
          message = "Image generation API connection failed. Please check your API key.";
        }
      } catch (e) {
        isValid = false;
        message = "Connection failed. Please check your network and try again.";
      }
    } else if (type === 'tikhub') {
      try {
        // Test TikHub API with a simple search query
        const testUrl = `https://api.tikhub.io/api/v1/xiaohongshu/web/search_notes?keyword=${encodeURIComponent('测试')}&page=1&sort=general&note_type=0`;
        console.log(`[TikHub Test] Calling: ${testUrl}`);
        console.log(`[TikHub Test] Token (first 10 chars): ${apiKey.slice(0, 10)}...`);
        
        const res = await fetch(testUrl, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(15000),
        });
        
        const resText = await res.text();
        console.log(`[TikHub Test] Status: ${res.status}, Body (first 300): ${resText.slice(0, 300)}`);
        
        if (res.ok) {
          let noteCount = 0;
          try {
            const data = JSON.parse(resText);
            noteCount = data?.data?.data?.items?.length || 0;
          } catch {}
          isValid = true;
          message = `TikHub API 连接成功！搜索返回 ${noteCount} 条笔记`;
        } else if (res.status === 401) {
          isValid = false;
          message = `TikHub API Token 无效 (401)。响应: ${resText.slice(0, 200)}`;
        } else {
          isValid = false;
          message = `TikHub API 返回错误 (${res.status}): ${resText.slice(0, 200)}`;
        }
      } catch (e: any) {
        isValid = false;
        const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
        message = isTimeout 
          ? 'TikHub API 连接超时 (15s)，Edge Function 可能无法访问 api.tikhub.io'
          : `TikHub API 连接失败: ${String(e).slice(0, 150)}`;
      }
    } else if (type === 'search') {
      if (provider === 'bocha') {
        try {
          const res = await fetch("https://api.bochaai.com/v1/web-search", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ query: "test", count: 1 })
          });
          isValid = res.ok;
          message = res.ok ? "Bocha API key is valid" : "Invalid Bocha API key";
        } catch (e) { 
          isValid = false; 
          message = "Connection failed. Please check your network."; 
        }
      } else if (provider === 'you') {
        try {
          const res = await fetch(`https://ydc-index.io/v1/search?query=test&count=1`, {
            headers: { "X-API-Key": apiKey }
          });
          isValid = res.ok;
          message = res.ok ? "You.com API key is valid" : "Invalid You.com API key";
        } catch (e) { 
          isValid = false; 
          message = "Connection failed. Please check your network."; 
        }
      } else if (provider === 'tavily') {
        try {
          const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: apiKey, query: "test", max_results: 1 })
          });
          isValid = res.ok;
          message = res.ok ? "Tavily API key is valid" : "Invalid Tavily API key";
        } catch (e) { 
          isValid = false; 
          message = "Connection failed. Please check your network."; 
        }
      } else {
        message = "Search provider is required";
      }
    }

    return new Response(
      JSON.stringify({ valid: isValid, message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    // Log detailed error server-side
    console.error("verify-config error:", error);
    
    // Return generic message for unexpected errors, specific for validation errors
    const message = error instanceof ValidationError 
      ? error.message 
      : "Configuration verification failed. Please try again.";
    
    return new Response(
      JSON.stringify({ valid: false, message }),
      { status: error instanceof ValidationError ? 400 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
