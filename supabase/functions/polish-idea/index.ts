import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAuthUserOrBypass } from "../_shared/dev-auth.ts";
import {
  requestChatCompletion,
  extractAssistantContent,
  normalizeLlmBaseUrl,
} from "../_shared/llm-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `你是一位创业顾问，擅长将简短的想法描述扩写为结构化的需求描述。

用户会给你一句简短的想法，请帮他扩写为 80-150 字的具体描述，需要涵盖：
1. 目标用户群体（谁会用？）
2. 核心痛点或卖点（解决什么问题？）
3. 使用场景（在什么情况下使用？）

要求：
- 保持用户原始想法的核心不变
- 语言自然流畅，不要使用标题或列表格式
- 直接输出润色后的描述，不要加任何前缀说明
- 用中文回答`;

const MESSAGES_FOR = (idea: string) => [
  { role: "system", content: SYSTEM_PROMPT },
  { role: "user", content: idea },
];

/** Try user-configured LLM first, then system LLM, then Lovable AI gateway. */
async function polishWithFallback(
  idea: string,
  config?: { llmBaseUrl?: string; llmApiKey?: string; llmModel?: string; llmFallbacks?: Array<{ baseUrl: string; apiKey: string; model: string }> },
): Promise<string> {
  const messages = MESSAGES_FOR(idea);
  const errors: string[] = [];

  // 1) User-configured primary LLM
  const userBase = normalizeLlmBaseUrl(config?.llmBaseUrl);
  const userKey = (config?.llmApiKey || "").trim();
  const userModel = (config?.llmModel || "").trim();
  if (userBase && userKey && userModel) {
    try {
      const res = await requestChatCompletion({
        baseUrl: userBase, apiKey: userKey, model: userModel,
        messages, temperature: 0.7, maxTokens: 500, timeoutMs: 20000,
      });
      const content = extractAssistantContent(res.json).trim();
      if (content) return content;
    } catch (e) {
      errors.push(`user_llm: ${(e as Error).message?.slice(0, 120)}`);
    }
  }

  // 2) User-configured fallbacks
  if (Array.isArray(config?.llmFallbacks)) {
    for (const fb of config!.llmFallbacks) {
      const fbBase = normalizeLlmBaseUrl(fb.baseUrl);
      const fbKey = (fb.apiKey || "").trim();
      const fbModel = (fb.model || "").trim();
      if (!fbBase || !fbKey || !fbModel) continue;
      try {
        const res = await requestChatCompletion({
          baseUrl: fbBase, apiKey: fbKey, model: fbModel,
          messages, temperature: 0.7, maxTokens: 500, timeoutMs: 20000,
        });
        const content = extractAssistantContent(res.json).trim();
        if (content) return content;
      } catch (e) {
        errors.push(`fallback: ${(e as Error).message?.slice(0, 120)}`);
      }
    }
  }

  // 3) System-level LLM env vars
  const sysBase = normalizeLlmBaseUrl(Deno.env.get("LLM_BASE_URL"));
  const sysKey = (Deno.env.get("LLM_API_KEY") || "").trim();
  const sysModel = (Deno.env.get("LLM_MODEL") || "").trim();
  if (sysBase && sysKey && sysModel) {
    try {
      const res = await requestChatCompletion({
        baseUrl: sysBase, apiKey: sysKey, model: sysModel,
        messages, temperature: 0.7, maxTokens: 500, timeoutMs: 20000,
      });
      const content = extractAssistantContent(res.json).trim();
      if (content) return content;
    } catch (e) {
      errors.push(`sys_llm: ${(e as Error).message?.slice(0, 120)}`);
    }
  }

  // 4) Lovable AI gateway as final fallback
  const lovableKey = (Deno.env.get("LOVABLE_API_KEY") || "").trim();
  if (lovableKey) {
    try {
      const res = await requestChatCompletion({
        baseUrl: "https://ai.gateway.lovable.dev/v1",
        apiKey: lovableKey,
        model: "google/gemini-3-flash-preview",
        messages, temperature: 0.7, maxTokens: 500, timeoutMs: 25000,
      });
      const content = extractAssistantContent(res.json).trim();
      if (content) return content;
    } catch (e) {
      errors.push(`lovable_ai: ${(e as Error).message?.slice(0, 120)}`);
    }
  }

  console.error("polish all providers failed:", errors.join(" | "));
  throw new Error("所有 AI 服务暂不可用，请稍后再试");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await resolveAuthUserOrBypass(supabase, req);

    const { idea, config } = await req.json();
    if (!idea || typeof idea !== "string" || idea.trim().length < 5) {
      return new Response(
        JSON.stringify({ error: "请输入至少 5 个字的想法描述" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const polished = await polishWithFallback(idea.trim(), config);

    return new Response(
      JSON.stringify({ polished }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("polish-idea error:", e);
    const msg = e instanceof Error ? e.message : "润色失败";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
