import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  validateString,
  validateStringArray,
  validateUserProvidedUrl,
  ValidationError,
  createErrorResponse,
  LIMITS,
} from "../_shared/validation.ts";
import { expandKeywords } from "../_shared/keyword-expander.ts";
import { resolveAuthUserOrBypass } from "../_shared/dev-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestConfig {
  llmBaseUrl?: string;
  llmApiKey?: string;
  llmModel?: string;
}

type SuggestedTag = {
  tag: string;
  confidence: number;
  reason: string;
  source: "core" | "user_phrase" | "trend" | "competitor";
};

function validateConfig(config: unknown): RequestConfig {
  if (!config || typeof config !== "object") return {};
  const c = config as Record<string, unknown>;
  return {
    llmBaseUrl: validateUserProvidedUrl(c.llmBaseUrl, "llmBaseUrl") || undefined,
    llmApiKey: validateString(c.llmApiKey, "llmApiKey", LIMITS.API_KEY_MAX_LENGTH) || undefined,
    llmModel: validateString(c.llmModel, "llmModel", LIMITS.MODEL_MAX_LENGTH) || undefined,
  };
}

function normalizeTag(text: string): string {
  return text
    .replace(/[，。！？、,.!?;；:：]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
}

function buildSuggestions(expanded: {
  coreKeywords: string[];
  userPhrases: string[];
  competitorQueries: string[];
  trendKeywords: string[];
}): SuggestedTag[] {
  const candidates: Array<{ raw: string; source: SuggestedTag["source"]; confidence: number; reason: string }> = [];

  for (const t of expanded.coreKeywords || []) {
    candidates.push({ raw: t, source: "core", confidence: 0.9, reason: "核心需求关键词，和你的想法最直接相关" });
  }
  for (const t of expanded.userPhrases || []) {
    candidates.push({ raw: t, source: "user_phrase", confidence: 0.8, reason: "用户真实搜索表达，可提升抓取命中率" });
  }
  for (const t of expanded.trendKeywords || []) {
    candidates.push({ raw: t, source: "trend", confidence: 0.72, reason: "用于补充市场趋势与增量信号" });
  }
  for (const t of expanded.competitorQueries || []) {
    candidates.push({ raw: t, source: "competitor", confidence: 0.66, reason: "用于补充竞品信息，不建议过量使用" });
  }

  const dedup = new Map<string, SuggestedTag>();
  for (const c of candidates) {
    const tag = normalizeTag(c.raw);
    if (!tag || tag.length < 2) continue;
    const key = tag.toLowerCase();
    const prev = dedup.get(key);
    if (!prev || c.confidence > prev.confidence) {
      dedup.set(key, {
        tag,
        confidence: c.confidence,
        reason: c.reason,
        source: c.source,
      });
    }
  }

  return Array.from(dedup.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    await resolveAuthUserOrBypass(supabase, req);

    const body = await req.json();
    const idea = validateString(body.idea, "idea", LIMITS.IDEA_MAX_LENGTH, true)!;
    const tags = validateStringArray(body.tags, "tags", LIMITS.TAG_MAX_COUNT, LIMITS.TAG_MAX_LENGTH);
    const config = validateConfig(body.config);

    // If frontend sends default api.openai.com URL, skip it and use system env vars
    const frontendUrlIsDefault = /api\.openai\.com/i.test(config.llmBaseUrl || "");
    const effectiveBaseUrl = frontendUrlIsDefault ? undefined : config.llmBaseUrl;
    const effectiveApiKey = frontendUrlIsDefault ? undefined : config.llmApiKey;
    const effectiveModel = frontendUrlIsDefault ? undefined : config.llmModel;

    const expanded = await expandKeywords(idea, tags, {
      apiKey: effectiveApiKey || Deno.env.get("LLM_API_KEY") || Deno.env.get("LOVABLE_API_KEY") || "",
      baseUrl: effectiveBaseUrl || Deno.env.get("LLM_BASE_URL") || "https://ai.gateway.lovable.dev/v1",
      model: effectiveModel || Deno.env.get("LLM_MODEL") || "google/gemini-3-flash-preview",
    });

    const suggestions = buildSuggestions(expanded.expanded);

    return new Response(JSON.stringify({
      success: true,
      suggestions,
      xhs_keywords: expanded.xhsKeywords,
      web_queries: expanded.webQueries,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return createErrorResponse(error, corsHeaders);
  }
});
