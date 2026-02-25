/**
 * Streaming Validation Edge Function (v2)
 * 
 * 优化版本 - 集成:
 * - Jina Reader 网页清洗
 * - 分层摘要系统
 * - 竞品名称提取 + 二次深度搜索
 * - 热门话题缓存
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  validateString,
  validateStringArray,
  validateUUID,
  validateUserProvidedUrl,
  ValidationError,
  LIMITS
} from "../_shared/validation.ts";
import { checkRateLimit, RateLimitError } from "../_shared/rate-limit.ts";
import { cleanCompetitorPages, isCleanableUrl } from "../_shared/jina-reader.ts";
import { summarizeBatch, aggregateSummaries, type SummaryConfig } from "../_shared/summarizer.ts";
import { applyContextBudget } from "../_shared/context-budgeter.ts";
import { routeCrawlerSource } from "../_shared/crawler-router.ts";
import {
  calculateEvidenceGrade,
  estimateCostBreakdown,
  createDefaultProofResult,
} from "../_shared/report-metrics.ts";
import { resolveAuthUserOrBypass } from "../_shared/dev-auth.ts";
import { requestChatCompletion, extractAssistantContent, normalizeLlmBaseUrl } from "../_shared/llm-client.ts";
import { 
  extractCompetitorNames, 
  searchCompetitorDetails, 
  mergeSearchResults,
  type SearchResult,
  type LLMConfig 
} from "../_shared/competitor-extractor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
};

interface SSEEvent {
  event: 'progress' | 'complete' | 'error';
  stage?: string;
  detailStage?: string;
  progress?: number;
  message?: string;
  meta?: Record<string, unknown>;
  result?: any;
  error?: string;
}

interface RequestConfig {
  llmProvider?: string;
  llmBaseUrl?: string;
  llmApiKey?: string;
  llmModel?: string;
  llmFallbacks?: Array<{
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  }>;
  tikhubToken?: string;
  enableXiaohongshu?: boolean;
  enableDouyin?: boolean;
  enableSelfCrawler?: boolean;
  enableTikhubFallback?: boolean;
  searchKeys?: {
    bocha?: string;
    you?: string;
    tavily?: string;
  };
  mode?: 'quick' | 'deep';
}

interface LLMRuntime {
  apiKey: string;
  baseUrl: string;
  model: string;
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, timeoutError: string): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutError)), Math.max(1000, timeoutMs));
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function hasReusableSocialData(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  const notes = Array.isArray(data.sampleNotes) ? data.sampleNotes.length : 0;
  const comments = Array.isArray(data.sampleComments) ? data.sampleComments.length : 0;
  return notes > 0 || comments > 0;
}

function hasReusableCompetitorData(data: unknown): boolean {
  return Array.isArray(data) && data.length > 0;
}

async function persistTopicCacheSnapshot(
  supabase: any,
  payload: {
    keyword: string;
    userId: string;
    tags: string[];
    socialData: any;
    competitorData: SearchResult[];
  },
): Promise<void> {
  const keyword = String(payload.keyword || "").trim();
  if (!keyword) return;
  const socialData = payload.socialData || {};
  const competitorData = Array.isArray(payload.competitorData) ? payload.competitorData : [];
  if (!hasReusableSocialData(socialData) && !hasReusableCompetitorData(competitorData)) return;

  const sampleNotes = Array.isArray(socialData.sampleNotes) ? socialData.sampleNotes : [];
  const sampleComments = Array.isArray(socialData.sampleComments) ? socialData.sampleComments : [];
  const engagement = sampleNotes.reduce((sum: number, n: any) => {
    return sum + Number(n?.liked_count || 0) + Number(n?.comments_count || 0) + Number(n?.collected_count || 0);
  }, 0);
  const sampleCount = sampleNotes.length + sampleComments.length;
  const avgEngagement = sampleNotes.length > 0 ? Math.round(engagement / sampleNotes.length) : 0;
  const heatScore = Math.max(1, Math.min(9999, sampleCount * 6 + Math.round(avgEngagement / 5)));

  const { error } = await supabase
    .from("trending_topics")
    .upsert(
      {
        keyword,
        category: "validation",
        heat_score: heatScore,
        sample_count: sampleCount,
        avg_engagement: avgEngagement,
        related_keywords: (payload.tags || []).slice(0, 8),
        sources: ["validation_stream_checkpoint"],
        is_active: true,
        created_by: payload.userId,
        cached_social_data: socialData,
        cached_competitor_data: competitorData,
        cache_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "keyword" },
    );
  if (error) {
    throw new Error(`[Cache] upsert trending_topics failed: ${error.message}`);
  }
}

async function syncValidationToTrendingTopics(
  supabase: any,
  payload: {
    idea: string;
    tags: string[];
    socialData: any;
    overallScore: number;
    userId: string;
  },
): Promise<void> {
  const tags = Array.isArray(payload.tags) ? payload.tags : [];
  const keyword = String(tags[0] || payload.idea || "").trim().slice(0, 32);
  if (!keyword) return;

  const socialData = payload.socialData || {};
  const sampleNotes = Array.isArray(socialData.sampleNotes) ? socialData.sampleNotes : [];
  const sampleComments = Array.isArray(socialData.sampleComments) ? socialData.sampleComments : [];
  const sampleCount = Math.max(1, sampleNotes.length + sampleComments.length);
  const avgLikes = Number(socialData.avgLikes || 0);
  const avgComments = Number(socialData.avgComments || 0);
  const avgEngagement = Math.round(avgLikes + avgComments * 2);
  const heatScore = Math.max(1, Math.min(100, Math.round(sampleCount * 2 + avgEngagement / 20)));
  const validationScore = Math.max(0, Math.min(100, Math.round(Number(payload.overallScore || 0))));
  const qualityScore = Math.max(1, Math.min(100, Math.round(
    heatScore * 0.45 +
    validationScore * 0.4 +
    Math.min(15, sampleCount) * 0.15
  )));

  const { data: existingTopic } = await supabase
    .from("trending_topics")
    .select("validation_count, avg_validation_score, heat_score")
    .eq("keyword", keyword)
    .maybeSingle();

  const oldCount = Number(existingTopic?.validation_count || 0);
  const oldAvgScore = Number(existingTopic?.avg_validation_score || 0);
  const nextCount = oldCount + 1;
  const nextAvgScore = oldCount > 0
    ? Math.round(((oldAvgScore * oldCount) + validationScore) / nextCount)
    : validationScore;
  const mergedHeat = Math.max(heatScore, Number(existingTopic?.heat_score || 0));
  const confidenceLevel = nextCount >= 3 ? "high" : "medium";

  const { error } = await supabase
    .from("trending_topics")
    .upsert({
      keyword,
      category: tags[1] || tags[0] || null,
      heat_score: mergedHeat,
      sample_count: sampleCount,
      avg_engagement: avgEngagement,
      related_keywords: tags.slice(0, 8),
      sources: [{ platform: "validation_stream", count: sampleCount }],
      is_active: true,
      created_by: payload.userId,
      validation_count: nextCount,
      avg_validation_score: nextAvgScore,
      confidence_level: confidenceLevel,
      quality_score: qualityScore,
      source_type: "user_validation",
      last_crawled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    }, { onConflict: "keyword" });

  if (error) {
    throw new Error(`[TrendingSync] upsert failed: ${error.message}`);
  }
}

function hasAggregatedInsights(input: { marketInsight: string; competitiveInsight: string; keyFindings: string[] } | null | undefined): boolean {
  if (!input) return false;
  return Boolean(
    String(input.marketInsight || "").trim() ||
    String(input.competitiveInsight || "").trim() ||
    (Array.isArray(input.keyFindings) && input.keyFindings.length > 0)
  );
}

function normalizeAggregatedInsights(raw: any): { marketInsight: string; competitiveInsight: string; keyFindings: string[] } {
  const safe = raw && typeof raw === "object" ? raw : {};
  return {
    marketInsight: String(safe.marketInsight || ""),
    competitiveInsight: String(safe.competitiveInsight || ""),
    keyFindings: Array.isArray(safe.keyFindings)
      ? safe.keyFindings.map((x: any) => String(x || "")).filter(Boolean).slice(0, 12)
      : [],
  };
}

async function loadValidationCheckpoint(
  supabase: any,
  validationId: string,
): Promise<{
  socialData: any;
  competitorData: SearchResult[];
  socialSummaries: string[];
  competitorSummaries: string[];
  aggregatedInsights: { marketInsight: string; competitiveInsight: string; keyFindings: string[] };
  extractedCompetitors: any[];
  checkpointStage: string;
  checkpointUpdatedAt: string;
} | null> {
  const { data, error } = await supabase
    .from("validation_reports")
    .select("xiaohongshu_data, competitor_data, data_summary")
    .eq("validation_id", validationId)
    .maybeSingle();
  if (error || !data) return null;

  const dataSummary = (data.data_summary && typeof data.data_summary === "object")
    ? data.data_summary
    : {};
  const socialSummaries = Array.isArray((dataSummary as any).socialSummaries)
    ? (dataSummary as any).socialSummaries.map((x: any) => String(x || "")).filter(Boolean).slice(0, 16)
    : [];
  const competitorSummaries = Array.isArray((dataSummary as any).competitorSummaries)
    ? (dataSummary as any).competitorSummaries.map((x: any) => String(x || "")).filter(Boolean).slice(0, 12)
    : [];
  const extractedCompetitors = Array.isArray((dataSummary as any).extractedCompetitors)
    ? (dataSummary as any).extractedCompetitors.map((x: any) => ({ name: String(x || "") })).filter((x: any) => !!x.name)
    : [];

  return {
    socialData: normalizeCachedSocialData(data.xiaohongshu_data),
    competitorData: normalizeCachedCompetitorData(data.competitor_data),
    socialSummaries,
    competitorSummaries,
    aggregatedInsights: normalizeAggregatedInsights((dataSummary as any).aggregatedInsights),
    extractedCompetitors,
    checkpointStage: String((dataSummary as any).checkpointStage || ""),
    checkpointUpdatedAt: String((dataSummary as any).checkpointUpdatedAt || ""),
  };
}

async function persistValidationCheckpoint(
  supabase: any,
  payload: {
    validationId: string;
    stage: string;
    socialData?: any;
    competitorData?: SearchResult[];
    socialSummaries?: string[];
    competitorSummaries?: string[];
    aggregatedInsights?: { marketInsight: string; competitiveInsight: string; keyFindings: string[] };
    extractedCompetitors?: string[];
  },
): Promise<void> {
  const { data: existing } = await supabase
    .from("validation_reports")
    .select("id, data_summary")
    .eq("validation_id", payload.validationId)
    .maybeSingle();

  const previousSummary = (existing?.data_summary && typeof existing.data_summary === "object")
    ? existing.data_summary
    : {};
  const nextSummary: any = {
    ...previousSummary,
    checkpointStage: payload.stage,
    checkpointUpdatedAt: new Date().toISOString(),
  };
  if (Array.isArray(payload.socialSummaries)) nextSummary.socialSummaries = payload.socialSummaries;
  if (Array.isArray(payload.competitorSummaries)) nextSummary.competitorSummaries = payload.competitorSummaries;
  if (payload.aggregatedInsights) nextSummary.aggregatedInsights = payload.aggregatedInsights;
  if (Array.isArray(payload.extractedCompetitors)) nextSummary.extractedCompetitors = payload.extractedCompetitors;

  const patch: any = {
    validation_id: payload.validationId,
    data_summary: nextSummary,
  };
  if (payload.socialData !== undefined) patch.xiaohongshu_data = payload.socialData;
  if (payload.competitorData !== undefined) patch.competitor_data = payload.competitorData;

  const writeQuery = existing?.id
    ? supabase.from("validation_reports").update(patch).eq("validation_id", payload.validationId)
    : supabase.from("validation_reports").insert(patch);
  const { error } = await writeQuery;
  if (error) {
    throw new Error(`[Checkpoint] persist failed: ${error.message}`);
  }
}

function compactCrawlerDiagnostic(input: unknown, maxLen = 220): string {
  const raw = String(input || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  return raw.length > maxLen ? `${raw.slice(0, maxLen)}...` : raw;
}

function extractCooldownSeconds(diagnostic: string): number {
  const match = String(diagnostic || "").match(/session_cooldown_active:(\d+)s/i);
  if (!match) return 0;
  const seconds = Number(match[1] || 0);
  return Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
}

function isSelfCrawlerRetryable(diagnostic: string, routeError: string): boolean {
  const text = `${diagnostic || ""};${routeError || ""}`.toLowerCase();
  return (
    text.includes("xhs_search_forbidden_-104")
    || text.includes("api_error_-104")
    || text.includes("session_crawl_empty")
    || text.includes("notes_found_but_comments_empty")
    || text.includes("session_cooldown_active")
    || text.includes("timeout")
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

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
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
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

function tryParseModelJsonLoose(content: string): any {
  const raw = stripCodeFence(content);
  if (!raw || raw.startsWith("<!doctype") || raw.startsWith("<html")) {
    throw new Error("non_json_payload_html");
  }
  const candidate = extractFirstBalancedJsonObject(raw);
  if (!candidate) throw new Error("no_json_object_in_content");

  try {
    return JSON.parse(candidate);
  } catch {
    // Light-weight repair for common provider defects.
    const repaired = candidate
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
      .replace(/,\s*([}\]])/g, "$1")
      .trim();
    return JSON.parse(repaired);
  }
}

function normalizeAnalysisResult(obj: any) {
  const safe = (obj && typeof obj === "object") ? obj : {};
  const overallScore = Number(safe.overallScore);
  const feasibilityScore = Number(safe?.aiAnalysis?.feasibilityScore);
  // Prioritize feasibilityScore as the canonical score for consistency
  const normalizedScore = Number.isFinite(feasibilityScore)
    ? Math.max(0, Math.min(100, Math.round(feasibilityScore)))
    : Number.isFinite(overallScore)
      ? Math.max(0, Math.min(100, Math.round(overallScore)))
      : 50;

  return {
    overallScore: normalizedScore,
    overallVerdict: String(safe.overallVerdict || safe.summary || "基于当前证据给出中性评估"),
    marketAnalysis: {
      targetAudience: String(safe?.marketAnalysis?.targetAudience || ""),
      marketSize: String(safe?.marketAnalysis?.marketSize || ""),
      competitionLevel: String(safe?.marketAnalysis?.competitionLevel || ""),
    },
    sentimentAnalysis: {
      positive: Number(safe?.sentimentAnalysis?.positive ?? 33),
      neutral: Number(safe?.sentimentAnalysis?.neutral ?? 34),
      negative: Number(safe?.sentimentAnalysis?.negative ?? 33),
    },
    aiAnalysis: {
      feasibilityScore: Number.isFinite(feasibilityScore) ? Math.max(0, Math.min(100, Math.round(feasibilityScore))) : normalizedScore,
      strengths: Array.isArray(safe?.aiAnalysis?.strengths) ? safe.aiAnalysis.strengths : [],
      weaknesses: Array.isArray(safe?.aiAnalysis?.weaknesses) ? safe.aiAnalysis.weaknesses : [],
      risks: Array.isArray(safe?.aiAnalysis?.risks) ? safe.aiAnalysis.risks : [],
      suggestions: Array.isArray(safe?.aiAnalysis?.suggestions) ? safe.aiAnalysis.suggestions : [],
    },
    persona: {
      name: String(safe?.persona?.name || "目标用户"),
      role: String(safe?.persona?.role || "潜在用户"),
      age: String(safe?.persona?.age || "待确认"),
      painPoints: Array.isArray(safe?.persona?.painPoints) ? safe.persona.painPoints : [],
      goals: Array.isArray(safe?.persona?.goals) ? safe.persona.goals : [],
    },
    dimensions: Array.isArray(safe?.dimensions) && safe.dimensions.length > 0
      ? safe.dimensions
      : [
          { dimension: "需求痛感", score: normalizedScore, reason: "模型未给出完整维度，已自动补齐" },
          { dimension: "市场规模", score: 50, reason: "默认值" },
          { dimension: "竞争壁垒", score: 50, reason: "默认值" },
          { dimension: "PMF潜力", score: 50, reason: "默认值" },
        ],
  };
}

function resolveSearchKeys(config?: RequestConfig) {
  return {
    tavily: config?.searchKeys?.tavily || Deno.env.get("TAVILY_API_KEY") || "",
    bocha: config?.searchKeys?.bocha || Deno.env.get("BOCHA_API_KEY") || "",
    you: config?.searchKeys?.you || Deno.env.get("YOU_API_KEY") || "",
  };
}

function normalizeLLMBaseUrl(input?: string) {
  return normalizeLlmBaseUrl(input || "https://ai.gateway.lovable.dev/v1");
}

function parseFallbackLLMsFromEnv(): LLMRuntime[] {
  const raw = Deno.env.get("LLM_FALLBACKS_JSON");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item: any) => ({
        apiKey: String(item.apiKey || ""),
        baseUrl: normalizeLLMBaseUrl(String(item.baseUrl || "")),
        model: String(item.model || ""),
      }))
      .filter((item) => !!item.apiKey && !!item.baseUrl && !!item.model);
  } catch (e) {
    console.warn("[LLM] Invalid LLM_FALLBACKS_JSON:", e);
    return [];
  }
}

function dedupeLLMRuntimes(items: LLMRuntime[]): LLMRuntime[] {
  const seen = new Set<string>();
  const out: LLMRuntime[] = [];
  for (const item of items) {
    const key = `${item.baseUrl}|${item.model}|${item.apiKey.slice(0, 12)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function resolveLLMRuntimes(config?: RequestConfig) {
  const configFallbacks = Array.isArray(config?.llmFallbacks)
    ? config!.llmFallbacks!
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          apiKey: String(item.apiKey || ""),
          baseUrl: normalizeLLMBaseUrl(String(item.baseUrl || "")),
          model: String(item.model || ""),
        }))
        .filter((item) => !!item.apiKey && !!item.baseUrl && !!item.model)
    : [];

  const primary: LLMRuntime = {
    apiKey: config?.llmApiKey || Deno.env.get("LLM_API_KEY") || Deno.env.get("LOVABLE_API_KEY") || "",
    baseUrl: normalizeLLMBaseUrl(config?.llmBaseUrl || Deno.env.get("LLM_BASE_URL") || "https://ai.gateway.lovable.dev/v1"),
    model: config?.llmModel || Deno.env.get("LLM_MODEL") || "google/gemini-3-flash-preview",
  };

  // Always include Lovable AI as the final safety-net fallback
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const lovableFallback: LLMRuntime = {
    apiKey: lovableApiKey,
    baseUrl: "https://ai.gateway.lovable.dev/v1",
    model: "google/gemini-2.5-flash",
  };

  const allCandidates = [primary, ...configFallbacks, ...parseFallbackLLMsFromEnv()];
  // Append Lovable AI fallback if it's not already in the list
  if (lovableApiKey) {
    allCandidates.push(lovableFallback);
  }

  const candidates = dedupeLLMRuntimes(allCandidates).filter((item) => !!item.apiKey);
  return { primary, candidates };
}

function countEnabledSearchProviders(keys: { tavily?: string; bocha?: string; you?: string }) {
  let n = 0;
  if (keys.tavily) n += 1;
  if (keys.bocha) n += 1;
  if (keys.you) n += 1;
  return n;
}

function validateConfig(config: unknown): RequestConfig {
  if (!config || typeof config !== "object") {
    return {};
  }
  const c = config as Record<string, unknown>;
  return {
    llmProvider: validateString(c.llmProvider, "llmProvider", LIMITS.MODEL_MAX_LENGTH) || undefined,
    llmBaseUrl: validateUserProvidedUrl(c.llmBaseUrl, "llmBaseUrl") || undefined,
    llmApiKey: validateString(c.llmApiKey, "llmApiKey", LIMITS.API_KEY_MAX_LENGTH) || undefined,
    llmModel: validateString(c.llmModel, "llmModel", LIMITS.MODEL_MAX_LENGTH) || undefined,
    llmFallbacks: Array.isArray(c.llmFallbacks)
      ? c.llmFallbacks.slice(0, 6).map((item) => {
          const obj = (item && typeof item === "object") ? item as Record<string, unknown> : {};
          return {
            baseUrl: validateUserProvidedUrl(obj.baseUrl, "llmFallback.baseUrl") || undefined,
            apiKey: validateString(obj.apiKey, "llmFallback.apiKey", LIMITS.API_KEY_MAX_LENGTH) || undefined,
            model: validateString(obj.model, "llmFallback.model", LIMITS.MODEL_MAX_LENGTH) || undefined,
          };
        }).filter((item) => !!item.baseUrl && !!item.apiKey && !!item.model)
      : undefined,
    tikhubToken: validateString(c.tikhubToken, "tikhubToken", LIMITS.API_KEY_MAX_LENGTH) || undefined,
    enableXiaohongshu: typeof c.enableXiaohongshu === 'boolean' ? c.enableXiaohongshu : true,
    enableDouyin: typeof c.enableDouyin === 'boolean' ? c.enableDouyin : false,
    enableSelfCrawler: typeof c.enableSelfCrawler === 'boolean' ? c.enableSelfCrawler : true,
    enableTikhubFallback: typeof c.enableTikhubFallback === 'boolean' ? c.enableTikhubFallback : true,
    searchKeys: c.searchKeys && typeof c.searchKeys === "object" ? {
      bocha: validateString((c.searchKeys as any).bocha, "bocha key", LIMITS.API_KEY_MAX_LENGTH) || undefined,
      you: validateString((c.searchKeys as any).you, "you key", LIMITS.API_KEY_MAX_LENGTH) || undefined,
      tavily: validateString((c.searchKeys as any).tavily, "tavily key", LIMITS.API_KEY_MAX_LENGTH) || undefined,
    } : undefined,
    mode: (c.mode === 'quick' || c.mode === 'deep') ? (c.mode as 'quick' | 'deep') : undefined,
  };
}

// 优化后的进度阶段
const STAGES = {
  INIT: { progress: 5, message: '初始化验证...' },
  KEYWORDS: { progress: 10, message: '智能扩展关键词...' },
  CACHE_CHECK: { progress: 12, message: '检查缓存数据...' },
  CRAWL_START: { progress: 18, message: '开始抓取社媒数据...' },
  CRAWL_XHS: { progress: 25, message: '抓取小红书数据...' },
  CRAWL_DY: { progress: 32, message: '抓取抖音数据...' },
  CRAWL_DONE: { progress: 38, message: '社媒数据抓取完成' },
  SEARCH: { progress: 45, message: '搜索竞品信息...' },
  JINA_CLEAN: { progress: 52, message: '清洗网页内容...' },
  EXTRACT_COMPETITORS: { progress: 58, message: '提取竞品名称...' },
  DEEP_SEARCH: { progress: 64, message: '二次深度搜索...' },
  SUMMARIZE_L1: { progress: 72, message: '生成数据摘要...' },
  SUMMARIZE_L2: { progress: 78, message: '聚合分析洞察...' },
  ANALYZE: { progress: 88, message: 'AI深度分析中...' },
  SAVE: { progress: 95, message: '保存验证报告...' },
  COMPLETE: { progress: 100, message: '验证完成' },
};

const MIN_NOTES_REQUIRED = 10;
const MIN_COMMENTS_REQUIRED = 50;
const MIN_COMMENTS_REQUIRED_TIKHUB = 8;

function getRequiredSampleThresholds(options?: { usedThirdPartyCrawler?: boolean }) {
  return {
    notes: MIN_NOTES_REQUIRED,
    comments: options?.usedThirdPartyCrawler ? MIN_COMMENTS_REQUIRED_TIKHUB : MIN_COMMENTS_REQUIRED,
  };
}

function hasEnoughSocialSamples(socialData: any, options?: { usedThirdPartyCrawler?: boolean }): boolean {
  const notes = Array.isArray(socialData?.sampleNotes) ? socialData.sampleNotes.length : 0;
  const comments = Array.isArray(socialData?.sampleComments) ? socialData.sampleComments.length : 0;
  const thresholds = getRequiredSampleThresholds(options);
  return notes >= thresholds.notes && comments >= thresholds.comments;
}

function getSocialSampleCounts(socialData: any): { notes: number; comments: number } {
  return {
    notes: Array.isArray(socialData?.sampleNotes) ? socialData.sampleNotes.length : 0,
    comments: Array.isArray(socialData?.sampleComments) ? socialData.sampleComments.length : 0,
  };
}

function normalizeKeywordForSearch(raw: string): string {
  return String(raw || "")
    .replace(/[：:，,。！？!?；;"'`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
}

function compactKeywordForCrawl(raw: string): string {
  const normalized = normalizeKeywordForSearch(raw);
  if (!normalized) return "";
  const zh = normalized.replace(/[^\u4e00-\u9fff]/g, "");
  if (zh.length >= 3) return zh.slice(0, Math.min(10, zh.length));
  const en = (normalized.match(/[A-Za-z0-9+.-]+/g) || []).join(" ");
  return (en || normalized).slice(0, 16).trim();
}

function isKeywordNearDuplicate(candidate: string, existing: string): boolean {
  const a = normalizeKeywordForSearch(candidate).toLowerCase();
  const b = normalizeKeywordForSearch(existing).toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const overlap = Math.min(a.length, b.length);
  return overlap >= 6 && (a.slice(0, overlap) === b.slice(0, overlap));
}

function mergeSocialSamples(base: any, incoming: any): any {
  const left = base && typeof base === "object" ? base : {};
  const right = incoming && typeof incoming === "object" ? incoming : {};
  const leftNotes = Array.isArray(left.sampleNotes) ? left.sampleNotes : [];
  const rightNotes = Array.isArray(right.sampleNotes) ? right.sampleNotes : [];
  const leftComments = Array.isArray(left.sampleComments) ? left.sampleComments : [];
  const rightComments = Array.isArray(right.sampleComments) ? right.sampleComments : [];

  const noteMap = new Map<string, any>();
  for (const item of [...leftNotes, ...rightNotes]) {
    const key = String(item?.note_id || item?.id || item?.title || "").trim();
    if (!key) continue;
    if (!noteMap.has(key)) noteMap.set(key, item);
  }

  const commentMap = new Map<string, any>();
  for (const item of [...leftComments, ...rightComments]) {
    const key = String(item?.comment_id || item?.id || item?.content || "").trim();
    if (!key) continue;
    if (!commentMap.has(key)) commentMap.set(key, item);
  }

  const mergedNotes = Array.from(noteMap.values()).slice(0, 80);
  const mergedComments = Array.from(commentMap.values()).slice(0, 300);
  const avgLikes = mergedNotes.length > 0
    ? Math.round(mergedNotes.reduce((sum: number, n: any) => sum + Number(n?.liked_count || n?.digg_count || 0), 0) / mergedNotes.length)
    : 0;
  const avgComments = mergedNotes.length > 0
    ? Math.round(mergedNotes.reduce((sum: number, n: any) => sum + Number(n?.comments_count || n?.comment_count || 0), 0) / mergedNotes.length)
    : 0;

  return {
    totalNotes: Math.max(Number(left.totalNotes || 0), Number(right.totalNotes || 0), mergedNotes.length),
    avgLikes,
    avgComments,
    avgCollects: Math.max(Number(left.avgCollects || 0), Number(right.avgCollects || 0)),
    sampleNotes: mergedNotes,
    sampleComments: mergedComments,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const sendEvent = async (event: SSEEvent) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    await writer.write(encoder.encode(data));
  };

  const sendProgress = async (
    stage: keyof typeof STAGES,
    extra?: { detailStage?: string; meta?: Record<string, unknown>; message?: string },
  ) => {
    const { progress, message } = STAGES[stage];
    await sendEvent({
      event: 'progress',
      stage: stage.toLowerCase(),
      progress,
      message: extra?.message || message,
      detailStage: extra?.detailStage,
      meta: extra?.meta,
    });
  };

  // Process validation asynchronously
  (async () => {
    let supabase: any = null;
    let validationId: string | null = null;
    let checkpointKeyword = "";
    let checkpointUserId = "";
    let checkpointTags: string[] = [];
    let checkpointSocialData: any = null;
    let checkpointCompetitorData: SearchResult[] = [];
    try {
      const body = await req.json();

      const idea = validateString(body.idea, "idea", LIMITS.IDEA_MAX_LENGTH, true)!;
      const tags = validateStringArray(body.tags, "tags", LIMITS.TAG_MAX_COUNT, LIMITS.TAG_MAX_LENGTH);
      const config = validateConfig(body.config);
      checkpointTags = tags || [];

      await sendProgress('INIT');

      supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      const { user } = await resolveAuthUserOrBypass(supabase, req);
      checkpointUserId = user.id;

      await checkRateLimit(supabase, user.id, "validate-idea");

      const requestedResumeValidationId = body.resumeValidationId
        ? validateUUID(body.resumeValidationId, "resumeValidationId")
        : null;

      let validation: any = null;
      let resumeCheckpoint: Awaited<ReturnType<typeof loadValidationCheckpoint>> = null;
      if (requestedResumeValidationId) {
        const { data: existingValidation, error: existingError } = await supabase
          .from("validations")
          .select("*")
          .eq("id", requestedResumeValidationId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (existingError) {
          throw new Error(`Failed to load resume validation: ${existingError.message}`);
        }
        const isFailed = existingValidation?.status === "failed";
        let allowResume = isFailed;
        if (!allowResume && existingValidation?.status === "processing") {
          const staleForMs = 120_000;
          const checkpoint = await loadValidationCheckpoint(supabase, requestedResumeValidationId);
          const stage = String(checkpoint?.checkpointStage || "").toLowerCase();
          const updatedAtRaw = String(checkpoint?.checkpointUpdatedAt || "");
          const updatedAtMs = updatedAtRaw ? Date.parse(updatedAtRaw) : 0;
          const stale = updatedAtMs > 0 ? (Date.now() - updatedAtMs >= staleForMs) : false;
          allowResume = stale && (stage.includes("analyze") || stage.includes("summarize"));
        }
        if (existingValidation && allowResume) {
          const { data: resumedValidation, error: resumeError } = await supabase
            .from("validations")
            .update({
              status: "processing",
              idea,
              tags: tags || [],
              updated_at: new Date().toISOString(),
            })
            .eq("id", requestedResumeValidationId)
            .eq("user_id", user.id)
            .select()
            .single();
          if (resumeError || !resumedValidation) {
            throw new Error("Failed to resume validation");
          }
          validation = resumedValidation;
          resumeCheckpoint = await loadValidationCheckpoint(supabase, resumedValidation.id);
        } else {
          console.warn(
            `[Resume] Skip resume id=${requestedResumeValidationId}, status=${existingValidation?.status || "not_found"}; fallback to new validation`
          );
        }
      }
      if (!validation) {
        // Create validation record
        const { data: createdValidation, error: createError } = await supabase
          .from("validations")
          .insert({
            user_id: user.id,
            idea,
            tags: tags || [],
            status: "processing",
          })
          .select()
          .single();
        if (createError || !createdValidation) {
          throw new Error("Failed to create validation");
        }
        validation = createdValidation;
      }
      validationId = validation.id;

      await sendProgress('KEYWORDS');

      // ============ Keyword Expansion ============
      const xhsKeywords = await expandKeywordsSimple(idea, tags, config);
      const xhsSearchTerm = xhsKeywords[0] || idea.slice(0, 20);
      checkpointKeyword = xhsSearchTerm;

      // ============ Cache Check ============
      await sendProgress('CACHE_CHECK');
      let usedCache = false;
      let cachedTopicId: string | null = null;
      let cachedSocialData: any = null;
      let cachedCompetitorData: SearchResult[] = [];
      let externalApiCalls = 0;
      let crawlerCalls = 0;
      let crawlerLatencyMs = 0;
      const crawlerProviderMix: Record<string, number> = {};
      let crawlSelfRetryCount = 0;
      let crawlFallbackUsed = false;
      let crawlFallbackReason = "";
      const startedAt = Date.now();

      try {
        const { data: cacheResult } = await supabase.rpc('get_cached_topic_data', {
          p_keyword: xhsSearchTerm
        });

        if (cacheResult?.[0]?.is_valid) {
          const hydratedSocial = normalizeCachedSocialData(cacheResult[0].cached_social_data);
          const hydratedCompetitor = normalizeCachedCompetitorData(cacheResult[0].cached_competitor_data);
          const hasCacheData = hasEnoughSocialSamples(hydratedSocial);

          if (hasCacheData) {
            console.log('[Cache] Hit for keyword:', xhsSearchTerm);
            usedCache = true;
            cachedTopicId = cacheResult[0].topic_id;
            cachedSocialData = hydratedSocial;
            cachedCompetitorData = hydratedCompetitor;
          } else {
            console.log(`[Cache] Valid but insufficient (<${MIN_NOTES_REQUIRED} notes or <${MIN_COMMENTS_REQUIRED} comments), fallback to fresh crawl`);
          }
          
          // 更新命中计数
          if (cachedTopicId) {
            await supabase.rpc('increment_cache_hit', { p_topic_id: cachedTopicId });
          }
        }
      } catch (e) {
        console.log('[Cache] Check failed, proceeding without cache:', e);
      }

      // ============ TikHub Quota Check ============
      const mode = config?.mode || 'quick';
      const enableXhs = config?.enableXiaohongshu ?? true;
      const enableDy = config?.enableDouyin ?? false;
      const enableSelfCrawler = config?.enableSelfCrawler ?? true;
      const enableTikhubFallback = config?.enableTikhubFallback ?? (mode === 'deep');

      // Auto-degradation: if self-crawler env is not configured, treat it as unavailable
      const crawlerServiceUrl = (Deno.env.get("CRAWLER_SERVICE_BASE_URL") || "").trim();
      const selfCrawlerAvailable = enableSelfCrawler && !!crawlerServiceUrl;
      const effectiveEnableTikhubFallback = enableTikhubFallback || !selfCrawlerAvailable;
      
      const userProvidedTikhub = effectiveEnableTikhubFallback && !!config?.tikhubToken;
      let tikhubToken = effectiveEnableTikhubFallback ? config?.tikhubToken : undefined;

      let socialData = {
        totalNotes: 0,
        avgLikes: 0,
        avgComments: 0,
        avgCollects: 0,
        sampleNotes: [] as any[],
        sampleComments: [] as any[]
      };
      let usedThirdPartyCrawler = false;
      let competitorData: SearchResult[] = [];
      let extractedCompetitors: any[] = [];
      let resumeSocialSummaries: string[] = [];
      let resumeCompetitorSummaries: string[] = [];
      let resumeAggregatedInsights = { marketInsight: '', competitiveInsight: '', keyFindings: [] as string[] };

      if (usedCache) {
        socialData = cachedSocialData;
        competitorData = cachedCompetitorData;
        console.log(
          `[Cache] Hydrated social=${socialData.sampleNotes.length} notes/${socialData.sampleComments.length} comments, competitors=${competitorData.length}`
        );
      }
      if (resumeCheckpoint) {
        if (hasReusableSocialData(resumeCheckpoint.socialData)) {
          socialData = resumeCheckpoint.socialData;
        }
        if (hasReusableCompetitorData(resumeCheckpoint.competitorData)) {
          competitorData = resumeCheckpoint.competitorData;
        }
        if (Array.isArray(resumeCheckpoint.extractedCompetitors) && resumeCheckpoint.extractedCompetitors.length > 0) {
          extractedCompetitors = resumeCheckpoint.extractedCompetitors;
        }
        resumeSocialSummaries = resumeCheckpoint.socialSummaries;
        resumeCompetitorSummaries = resumeCheckpoint.competitorSummaries;
        resumeAggregatedInsights = resumeCheckpoint.aggregatedInsights;
        if ((enableXhs ? hasEnoughSocialSamples(socialData) : hasReusableCompetitorData(competitorData))) {
          usedCache = true;
          await sendEvent({
            event: "progress",
            stage: "cache_check",
            progress: 14,
            message: `已加载上次断点数据（${resumeCheckpoint.checkpointStage || "checkpoint"}），继续执行...`,
          });
        }
      }
      checkpointSocialData = socialData;
      checkpointCompetitorData = competitorData;

      if (!usedCache && (enableXhs || enableDy) && !selfCrawlerAvailable && !effectiveEnableTikhubFallback) {
        throw new ValidationError("DATA_SOURCE_DISABLED:已关闭自爬与TikHub兜底，且当前无可用缓存。请至少启用一个采集链路。");
      }

      // ============ Social Media Crawling ============
      if (!usedCache && (enableXhs || enableDy)) {
        await sendProgress('CRAWL_START');
        let usedSelfCrawler = false;
        let selfCrawlerRouteError = "";
        let selfCrawlerRouteDiagnostic = "";

        const shouldAttemptSelfCrawler = selfCrawlerAvailable;
        const effectiveCrawlerMode: "quick" | "deep" = mode === "deep" ? "deep" : "quick";
        const maxSelfRetries = 2;
        let selfRetryCount = 0;
        let fallbackReason = "";
        if (shouldAttemptSelfCrawler) {
          // Keep timeout long enough for crawler runtime + callback roundtrip.
          // In practice xhs session crawl can take ~70s per keyword; shorter timeout will false-report as zero.
          const crawlerTimeoutMs = mode === "deep" ? 180000 : 130000;
          const preferredMinNotes = MIN_NOTES_REQUIRED;
          const preferredMinComments = MIN_COMMENTS_REQUIRED;
          const crawlQueries = [xhsSearchTerm, ...xhsKeywords.filter((k) => !isKeywordNearDuplicate(k, xhsSearchTerm))].slice(0, 4);
          for (let attempt = 0; attempt <= maxSelfRetries; attempt++) {
            for (let qi = 0; qi < crawlQueries.length; qi++) {
              if (hasEnoughSocialSamples(socialData)) break;
              const query = compactKeywordForCrawl(crawlQueries[qi]) || crawlQueries[qi];
              const crawlerStarted = Date.now();
              let crawlTick = 0;
              const crawlHeartbeat = setInterval(() => {
                crawlTick += 1;
                void sendEvent({
                  event: "progress",
                  stage: "crawl_start",
                  detailStage: "crawl_heartbeat",
                  progress: 18,
                  message: `抓取中（重试 ${attempt}/${maxSelfRetries}，关键词 ${qi + 1}/${crawlQueries.length}：${query}，已等待 ${crawlTick * 5}s）...`,
                  meta: {
                    branch: "self_crawler",
                    attempt,
                    maxAttempts: maxSelfRetries,
                    queryIndex: qi + 1,
                    queryTotal: crawlQueries.length,
                  },
                });
              }, 5000);
              const routed = await routeCrawlerSource({
                supabase,
                validationId: validation.id,
                userId: user.id,
                query,
                mode: effectiveCrawlerMode,
                enableXiaohongshu: enableXhs,
                enableDouyin: enableDy,
                source: "self_crawler",
                freshnessDays: 30,
                timeoutMs: crawlerTimeoutMs,
              }).finally(() => clearInterval(crawlHeartbeat));
              if (routed.usedCrawlerService) {
                crawlerCalls += 1;
                crawlerLatencyMs += Date.now() - crawlerStarted;
                const mix = (routed.costBreakdown.provider_mix || routed.costBreakdown.crawler_provider_mix || {}) as Record<string, unknown>;
                for (const [provider, value] of Object.entries(mix)) {
                  crawlerProviderMix[provider] = Number(crawlerProviderMix[provider] || 0) + Number(value || 0);
                }
                externalApiCalls += Number(routed.costBreakdown.external_api_calls || 0);
              }
              if (routed.error) {
                selfCrawlerRouteError = String(routed.error);
              }
              if (routed.diagnostic) {
                selfCrawlerRouteDiagnostic = String(routed.diagnostic);
              }

              if (routed.socialData) {
                socialData = mergeSocialSamples(socialData, routed.socialData);
                const mergedCounts = getSocialSampleCounts(socialData);
                await sendEvent({
                  event: "progress",
                  stage: "crawl_start",
                  detailStage: "query_done",
                  progress: mergedCounts.notes >= preferredMinNotes && mergedCounts.comments >= preferredMinComments ? 30 : 24,
                  message: `关键词 ${qi + 1}/${crawlQueries.length} 完成，累计笔记 ${mergedCounts.notes}/${preferredMinNotes}，评论 ${mergedCounts.comments}/${preferredMinComments}`,
                  meta: {
                    branch: "self_crawler",
                    attempt,
                    notes: mergedCounts.notes,
                    comments: mergedCounts.comments,
                    minNotes: preferredMinNotes,
                    minComments: preferredMinComments,
                  },
                });
              } else {
                const afterCounts = getSocialSampleCounts(socialData);
                const routeErr = String(routed.error || "").toLowerCase();
                if (routeErr.includes("timeout")) {
                  await sendEvent({
                    event: "progress",
                    stage: "crawl_start",
                    detailStage: "query_timeout",
                    progress: 20,
                    message: `关键词 ${qi + 1}/${crawlQueries.length} 超时未返回结果（累计笔记 ${afterCounts.notes}/${preferredMinNotes}，评论 ${afterCounts.comments}/${preferredMinComments}）`,
                    meta: { branch: "self_crawler", attempt },
                  });
                } else {
                  await sendEvent({
                    event: "progress",
                    stage: "crawl_start",
                    detailStage: "query_empty",
                    progress: 20,
                    message: `关键词 ${qi + 1}/${crawlQueries.length} 完成，本轮无新增（累计笔记 ${afterCounts.notes}/${preferredMinNotes}，评论 ${afterCounts.comments}/${preferredMinComments}）`,
                    meta: { branch: "self_crawler", attempt },
                  });
                }
              }
              try {
                await persistValidationCheckpoint(supabase, {
                  validationId: validation.id,
                  stage: "crawl_partial",
                  socialData,
                  competitorData,
                });
              } catch (_e) {
                // ignore checkpoint failures during crawl loop
              }
            }

            if (hasEnoughSocialSamples(socialData)) break;
            const retryable = isSelfCrawlerRetryable(selfCrawlerRouteDiagnostic, selfCrawlerRouteError);
            if (!retryable || attempt >= maxSelfRetries) break;
            selfRetryCount = attempt + 1;
            const waitMs = Math.min(12000, 2000 * (2 ** attempt) + Math.floor(Math.random() * 800));
            await sendEvent({
              event: "progress",
              stage: "crawl_start",
              detailStage: "crawl_retry",
              progress: 23,
              message: `自爬样本不足，准备第 ${attempt + 1}/${maxSelfRetries} 次重试（等待 ${Math.max(1, Math.round(waitMs / 1000))}s）...`,
              meta: {
                branch: "self_crawler",
                selfRetryCount,
                diagnostic: compactCrawlerDiagnostic(selfCrawlerRouteDiagnostic),
              },
            });
            await sleep(waitMs);
          }
          if (hasEnoughSocialSamples(socialData)) {
            usedSelfCrawler = true;
            console.log("[SourceRouter] Using merged crawler-service data");
          } else {
            const mergedCounts = getSocialSampleCounts(socialData);
            if (mergedCounts.notes === 0 && mergedCounts.comments === 0) {
              console.log("[SourceRouter] crawler-service returned empty samples");
              await sendEvent({
                event: "progress",
                stage: "crawl_start",
                progress: 22,
                message: "抓取返回为空，准备切换兜底或返回错误...",
              });
            } else {
              await sendEvent({
                  event: "progress",
                  stage: "crawl_start",
                  detailStage: "crawl_insufficient",
                  progress: 24,
                  message: `抓取返回但样本不足：笔记 ${mergedCounts.notes}/${preferredMinNotes}，评论 ${mergedCounts.comments}/${preferredMinComments}`,
                  meta: {
                    branch: "self_crawler",
                    selfRetryCount,
                  },
                });
            }
            fallbackReason = compactCrawlerDiagnostic(selfCrawlerRouteDiagnostic) || selfCrawlerRouteError || "self_crawler_insufficient";
          }
        }
        crawlSelfRetryCount = selfRetryCount;

        if (!usedSelfCrawler && effectiveEnableTikhubFallback) {
          if (!tikhubToken && !selfCrawlerAvailable) {
            throw new ValidationError("DATA_SOURCE_UNAVAILABLE:自爬服务未连接且未配置 TikHub Token。请联系管理员或在设置中配置 Token。");
          }

          // No free quota - require user's own TikHub token
          if (!tikhubToken) {
            throw new ValidationError("TIKHUB_TOKEN_REQUIRED:请在设置中配置您的 TikHub API Token 后继续使用。");
          }

          if (tikhubToken) {
            crawlFallbackUsed = true;
            crawlFallbackReason = fallbackReason || compactCrawlerDiagnostic(selfCrawlerRouteDiagnostic) || selfCrawlerRouteError || "self_crawler_insufficient";
            await sendEvent({
              event: "progress",
              stage: "crawl_start",
              detailStage: "fallback_switch",
              progress: 26,
              message: "已切换 TikHub 兜底抓取...",
              meta: {
                branch: "tikhub_fallback",
                selfRetryCount,
                fallbackReason: crawlFallbackReason,
              },
            });
            usedThirdPartyCrawler = true;
            if (enableXhs) {
              await sendProgress('CRAWL_XHS', {
                detailStage: "fallback_crawl_xhs",
                meta: { branch: "tikhub_fallback", selfRetryCount },
              });
              const xhsData = await crawlXhsSimple(xhsSearchTerm, tikhubToken, mode);
              socialData.totalNotes += xhsData.totalNotes;
              socialData.avgLikes += xhsData.avgLikes;
              socialData.avgComments += xhsData.avgComments;
              socialData.sampleNotes.push(...xhsData.sampleNotes);
              socialData.sampleComments.push(...xhsData.sampleComments);
              externalApiCalls += xhsData.apiCalls || 0;
            }

            if (enableDy) {
              await sendProgress('CRAWL_DY', {
                detailStage: "fallback_crawl_douyin",
                meta: { branch: "tikhub_fallback", selfRetryCount },
              });
              const dyData = await crawlDouyinSimple(xhsSearchTerm, tikhubToken, mode);
              socialData.totalNotes += dyData.totalNotes;
              socialData.avgLikes += dyData.avgLikes;
              socialData.avgComments += dyData.avgComments;
              socialData.sampleNotes.push(...dyData.sampleNotes);
              socialData.sampleComments.push(...dyData.sampleComments);
              externalApiCalls += dyData.apiCalls || 0;
            }
          } else {
            console.log("[SourceRouter] TikHub fallback enabled but token missing, skip fallback");
          }
        }

        if (!usedSelfCrawler && !effectiveEnableTikhubFallback) {
          const diagnostic = compactCrawlerDiagnostic(selfCrawlerRouteDiagnostic);
          const lowerDiagnostic = diagnostic.toLowerCase();
          const mergedCounts = getSocialSampleCounts(socialData);
          if (lowerDiagnostic.includes("daily_budget_exceeded")) {
            throw new ValidationError(
              `CRAWLER_BUDGET_EXCEEDED:自爬日预算已用尽（${diagnostic || "daily_budget_exceeded"}）。请次日重试，或开启 TikHub 兜底。`
            );
          }
          if (
            lowerDiagnostic.includes("session_not_found")
            || lowerDiagnostic.includes("missing_required_cookies")
            || lowerDiagnostic.includes("cookies_expired")
            || lowerDiagnostic.includes("session_stale")
            || lowerDiagnostic.includes("session_fail_threshold_reached")
          ) {
            throw new ValidationError(
              `SELF_CRAWLER_SESSION_INVALID:自爬会话不可用（${diagnostic || "session_invalid"}）。请重新扫码登录后重试。`
            );
          }
          if (lowerDiagnostic.includes("xhs_search_forbidden_-104") || lowerDiagnostic.includes("api_error_-104")) {
            throw new ValidationError(
              `SELF_CRAWLER_XHS_FORBIDDEN:当前小红书账号在网页搜索接口被限权（-104），无法按关键词抓取。请更换账号重试，或开启 TikHub 兜底。`
            );
          }
          const cooldownSeconds = extractCooldownSeconds(diagnostic);
          if (cooldownSeconds > 0 || lowerDiagnostic.includes("session_cooldown_active")) {
            const waitHint = cooldownSeconds > 0 ? `${cooldownSeconds}秒` : "约1分钟";
            throw new ValidationError(
              `SELF_CRAWLER_COOLDOWN:当前账号请求过于频繁，正在冷却（剩余${waitHint}）。无需重新扫码，请稍后重试。`
            );
          }
          if (selfCrawlerRouteError && selfCrawlerRouteError !== "failed") {
            throw new ValidationError(
              `CRAWLER_UNAVAILABLE:自爬服务当前不可用（${selfCrawlerRouteError}）。请刷新后重试，或开启 TikHub 兜底。`
            );
          }
          if (mergedCounts.notes > 0 || mergedCounts.comments > 0) {
            throw new ValidationError(
              `SELF_CRAWLER_EMPTY:样本不足（笔记${mergedCounts.notes}/${MIN_NOTES_REQUIRED}，评论${mergedCounts.comments}/${MIN_COMMENTS_REQUIRED}）。请稍后重试，或开启 TikHub 兜底后重试。`
            );
          }
          if (diagnostic) {
            throw new ValidationError(`SELF_CRAWLER_EMPTY:自爬未抓到有效评论样本（${diagnostic}）。请重新扫码登录后重试。`);
          }
          throw new ValidationError("SELF_CRAWLER_EMPTY:自爬未抓到有效评论样本。请重新扫码登录后重试。");
        }
      }

      let socialDataDegraded = false;
      if (!usedCache && (enableXhs || enableDy)) {
        const noteCount = Array.isArray(socialData.sampleNotes) ? socialData.sampleNotes.length : 0;
        const commentCount = Array.isArray(socialData.sampleComments) ? socialData.sampleComments.length : 0;
        const thresholds = getRequiredSampleThresholds({ usedThirdPartyCrawler });

        if (noteCount < thresholds.notes || commentCount < thresholds.comments) {
          // If we have SOME data (>0 notes or comments), continue in degraded mode
          // instead of throwing a hard error - the report will note limited data
          if (noteCount > 0 || commentCount > 0) {
            console.warn(`[SampleCheck] Below threshold but has partial data (notes=${noteCount}/${thresholds.notes}, comments=${commentCount}/${thresholds.comments}), continuing in degraded mode`);
            socialDataDegraded = true;
            await sendEvent({
              event: "progress",
              stage: "crawl_done",
              progress: 36,
              message: `社媒样本偏少（笔记${noteCount}，评论${commentCount}），将结合竞品数据继续分析...`,
              meta: { degraded: true, noteCount, commentCount },
            });
          } else {
            // Completely zero data - still try to continue with competitor-only analysis
            console.warn(`[SampleCheck] Zero social samples, will attempt competitor-only analysis`);
            socialDataDegraded = true;
            await sendEvent({
              event: "progress",
              stage: "crawl_done",
              progress: 36,
              message: `社媒数据暂时无法获取，将使用竞品搜索数据进行分析...`,
              meta: { degraded: true, noteCount: 0, commentCount: 0 },
            });
          }
        }
      }

      await sendProgress('CRAWL_DONE');
      checkpointSocialData = socialData;

      // Persist crawled social samples for later hotspot/trend mining.
      try {
        await persistSocialSignals(supabase, socialData);
      } catch (persistError) {
        console.error("[SignalPersist] Failed to persist social samples:", persistError);
      }
      try {
        await persistTopicCacheSnapshot(supabase, {
          keyword: checkpointKeyword,
          userId: checkpointUserId,
          tags: checkpointTags,
          socialData,
          competitorData,
        });
      } catch (cachePersistError) {
        console.error("[Cache] Persist checkpoint after crawl failed:", cachePersistError);
      }
      try {
        await persistValidationCheckpoint(supabase, {
          validationId: validation.id,
          stage: "crawl_done",
          socialData,
          competitorData,
        });
      } catch (checkpointError) {
        console.error("[Checkpoint] Persist after crawl failed:", checkpointError);
      }

      // ============ Competitor Search + Jina Clean + Deep Search ============
      const searchKeys = resolveSearchKeys(config);
      const { primary: llmRuntime, candidates: llmCandidates } = resolveLLMRuntimes(config);
      
      const hasAnySearchKey = searchKeys.tavily || searchKeys.bocha || searchKeys.you;

      if (hasAnySearchKey && (!usedCache || competitorData.length === 0)) {
        // 初次搜索
        await sendProgress('SEARCH');
        const rawCompetitors = await searchCompetitorsSimple(idea, searchKeys);
        externalApiCalls += Math.max(1, countEnabledSearchProviders(searchKeys));

        // Jina Reader 清洗
        await sendProgress('JINA_CLEAN');
        const cleanableUrls = rawCompetitors
          .filter(c => c.url && isCleanableUrl(c.url))
          .slice(0, 6)
          .map(c => c.url);

        let cleanedPages: any[] = [];
        if (cleanableUrls.length > 0) {
          try {
            cleanedPages = await cleanCompetitorPages(cleanableUrls, 3, 4000);
            externalApiCalls += cleanableUrls.length;
          } catch (e) {
            console.error('[Jina] Batch clean error:', e);
          }
        }

        // 合并清洗后的内容
        competitorData = rawCompetitors.map(comp => {
          const cleaned = cleanedPages.find(p => p.url === comp.url);
          return {
            ...comp,
            cleanedContent: cleaned?.success ? cleaned.markdown : comp.snippet,
            hasCleanedContent: cleaned?.success || false
          };
        });

        // 提取竞品名称
        await sendProgress('EXTRACT_COMPETITORS');
        const llmConfig: LLMConfig = {
          apiKey: llmRuntime.apiKey,
          baseUrl: llmRuntime.baseUrl,
          model: llmRuntime.model
        };

        if (llmConfig.apiKey) {
          try {
            extractedCompetitors = await extractCompetitorNames(competitorData, idea, llmConfig);
            console.log('[Competitors] Extracted:', extractedCompetitors.map(c => c.name));
          } catch (e) {
            console.error('[Competitors] Extract error:', e);
          }
        }

        // 二次深度搜索
        if (extractedCompetitors.length > 0) {
          await sendProgress('DEEP_SEARCH');
          try {
            const deepResults = await searchCompetitorDetails(extractedCompetitors, searchKeys);
            competitorData = mergeSearchResults(competitorData, deepResults);
            externalApiCalls += deepResults.length > 0 ? 1 : 0;
            console.log('[DeepSearch] Added', deepResults.length, 'results');
            checkpointCompetitorData = competitorData;
            try {
              await persistTopicCacheSnapshot(supabase, {
                keyword: checkpointKeyword,
                userId: checkpointUserId,
                tags: checkpointTags,
                socialData,
                competitorData,
              });
            } catch (cachePersistError) {
              console.error("[Cache] Persist checkpoint after deep search failed:", cachePersistError);
            }
            try {
              await persistValidationCheckpoint(supabase, {
                validationId: validation.id,
                stage: "deep_search_done",
                socialData,
                competitorData,
                extractedCompetitors: extractedCompetitors.map((c: any) => String(c?.name || "")).filter(Boolean),
              });
            } catch (checkpointError) {
              console.error("[Checkpoint] Persist after deep search failed:", checkpointError);
            }
          } catch (e) {
            console.error('[DeepSearch] Error:', e);
          }
        }
      }

      const budgeted = applyContextBudget(socialData, competitorData, mode);
      socialData = budgeted.socialData;
      competitorData = budgeted.competitorData;
      checkpointSocialData = socialData;
      checkpointCompetitorData = competitorData;
      console.log(`[Budget] chars ${budgeted.stats.char_before} -> ${budgeted.stats.char_after}, notes ${budgeted.stats.notes_before}/${budgeted.stats.notes_after}, comments ${budgeted.stats.comments_before}/${budgeted.stats.comments_after}, competitors ${budgeted.stats.competitors_before}/${budgeted.stats.competitors_after}`);

      // ============ Tiered Summarization ============
      await sendProgress('SUMMARIZE_L1');
      
      const summaryConfig: SummaryConfig = {
        apiKey: llmRuntime.apiKey,
        baseUrl: llmRuntime.baseUrl,
        model: llmRuntime.model
      };

      // If primary LLM is user-provided, prepare Lovable AI fallback for summarizer
      const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
      const summaryFallbackConfig: SummaryConfig | null = (lovableKey && llmRuntime.baseUrl !== "https://ai.gateway.lovable.dev/v1") ? {
        apiKey: lovableKey,
        baseUrl: "https://ai.gateway.lovable.dev/v1",
        model: "google/gemini-2.5-flash",
      } : null;
      let socialSummaries = resumeSocialSummaries;
      let competitorSummaries = resumeCompetitorSummaries;
      let aggregatedInsights = resumeAggregatedInsights;

      if (summaryConfig.apiKey) {
        // Layer 1: 单条摘要
        const socialItems = socialData.sampleNotes
          .slice(0, 8)
          .map(note => ({
            content: `${note.title || ''}\n${note.desc || ''}`.trim(),
            type: 'social_post' as const
          }))
          .filter(item => item.content.length > 20);

        const competitorItems = competitorData
          .slice(0, 5)
          .map(comp => ({
            content: comp.cleanedContent || comp.snippet || '',
            type: 'competitor_page' as const
          }))
          .filter(item => item.content.length > 50);

        if ((socialItems.length > 0 || competitorItems.length > 0) && socialSummaries.length === 0 && competitorSummaries.length === 0) {
          let l1Heartbeat: number | undefined;
          try {
            const allItems = [...socialItems, ...competitorItems];
            let tick = 0;
            await sendEvent({
              event: "progress",
              stage: "summarize_l1",
              detailStage: "summarize_heartbeat",
              progress: 72,
              message: `生成数据摘要处理中（${allItems.length}条，0s）...`,
              meta: { elapsedSeconds: 0, items: allItems.length },
            });
            l1Heartbeat = setInterval(() => {
              tick += 1;
              void sendEvent({
                event: "progress",
                stage: "summarize_l1",
                detailStage: "summarize_heartbeat",
                progress: 72,
                message: `生成数据摘要处理中（${allItems.length}条，${tick * 5}s）...`,
                meta: { elapsedSeconds: tick * 5, items: allItems.length },
              });
            }, 5000);
            const l1TimeoutMs = mode === "deep" ? 90000 : 60000;
            const summaries = await withTimeout(
              summarizeBatch(allItems, summaryConfig, 4),
              l1TimeoutMs,
              `summarize_l1_timeout_${l1TimeoutMs}ms`,
            );
            
            socialSummaries = summaries
              .filter(s => s.type === 'social_post')
              .map(s => s.content);
            competitorSummaries = summaries
              .filter(s => s.type === 'competitor_page')
              .map(s => s.content);

            console.log('[Summarizer] L1 done:', socialSummaries.length, 'social,', competitorSummaries.length, 'competitor');
            try {
              await persistValidationCheckpoint(supabase, {
                validationId: validation.id,
                stage: "summarize_l1_done",
                socialData,
                competitorData,
                socialSummaries,
                competitorSummaries,
                extractedCompetitors: extractedCompetitors.map((c: any) => String(c?.name || "")).filter(Boolean),
              });
            } catch (checkpointError) {
              console.error("[Checkpoint] Persist after summarize_l1 failed:", checkpointError);
            }
          } catch (e) {
            console.error('[Summarizer] L1 error:', e);
            // Retry with Lovable AI fallback if available
            if (summaryFallbackConfig && socialSummaries.length === 0) {
              try {
                console.log('[Summarizer] L1 retrying with Lovable AI fallback...');
                await sendEvent({
                  event: "progress",
                  stage: "summarize_l1",
                  detailStage: "summarize_fallback_retry",
                  progress: 73,
                  message: "切换备用AI模型重试摘要...",
                });
                const allItems = [...socialItems, ...competitorItems];
                const summaries = await withTimeout(
                  summarizeBatch(allItems, summaryFallbackConfig, 4),
                  60000,
                  "summarize_l1_fallback_timeout",
                );
                socialSummaries = summaries.filter(s => s.type === 'social_post').map(s => s.content);
                competitorSummaries = summaries.filter(s => s.type === 'competitor_page').map(s => s.content);
                console.log('[Summarizer] L1 fallback done:', socialSummaries.length, 'social,', competitorSummaries.length, 'competitor');
              } catch (fallbackError) {
                console.error('[Summarizer] L1 fallback also failed:', fallbackError);
              }
            }
            if (socialSummaries.length === 0) {
              await sendEvent({
                event: "progress",
                stage: "summarize_l1",
                detailStage: "summarize_fallback",
                progress: 74,
                message: "摘要阶段超时或失败，已降级继续后续分析...",
              });
            }
          } finally {
            if (l1Heartbeat !== undefined) clearInterval(l1Heartbeat);
          }
        }

        // Layer 2: 聚合摘要
        await sendProgress('SUMMARIZE_L2');
        if ((socialSummaries.length > 0 || competitorSummaries.length > 0) && !hasAggregatedInsights(aggregatedInsights)) {
          let l2Heartbeat: number | undefined;
          try {
            let tick = 0;
            await sendEvent({
              event: "progress",
              stage: "summarize_l2",
              detailStage: "summarize_heartbeat",
              progress: 78,
              message: "聚合分析洞察处理中（0s）...",
              meta: { elapsedSeconds: 0 },
            });
            l2Heartbeat = setInterval(() => {
              tick += 1;
              void sendEvent({
                event: "progress",
                stage: "summarize_l2",
                detailStage: "summarize_heartbeat",
                progress: 78,
                message: `聚合分析洞察处理中（${tick * 5}s）...`,
                meta: { elapsedSeconds: tick * 5 },
              });
            }, 5000);
            const l2TimeoutMs = mode === "deep" ? 30000 : 20000;
            aggregatedInsights = await withTimeout(
              aggregateSummaries(socialSummaries, competitorSummaries, summaryConfig),
              l2TimeoutMs,
              `summarize_l2_timeout_${l2TimeoutMs}ms`,
            );
            console.log('[Summarizer] L2 done');
            try {
              await persistValidationCheckpoint(supabase, {
                validationId: validation.id,
                stage: "summarize_l2_done",
                socialData,
                competitorData,
                socialSummaries,
                competitorSummaries,
                aggregatedInsights,
                extractedCompetitors: extractedCompetitors.map((c: any) => String(c?.name || "")).filter(Boolean),
              });
            } catch (checkpointError) {
              console.error("[Checkpoint] Persist after summarize_l2 failed:", checkpointError);
            }
          } catch (e) {
            console.error('[Summarizer] L2 error:', e);
            // Retry L2 with Lovable AI fallback
            if (summaryFallbackConfig && !hasAggregatedInsights(aggregatedInsights)) {
              try {
                console.log('[Summarizer] L2 retrying with Lovable AI fallback...');
                aggregatedInsights = await withTimeout(
                  aggregateSummaries(socialSummaries, competitorSummaries, summaryFallbackConfig),
                  20000,
                  "summarize_l2_fallback_timeout",
                );
                console.log('[Summarizer] L2 fallback done');
              } catch (fallbackError) {
                console.error('[Summarizer] L2 fallback also failed:', fallbackError);
              }
            }
            if (!hasAggregatedInsights(aggregatedInsights)) {
              await sendEvent({
                event: "progress",
                stage: "summarize_l2",
                detailStage: "summarize_fallback",
                progress: 80,
                message: "聚合摘要超时或失败，已降级继续AI分析...",
              });
            }
          } finally {
            if (l2Heartbeat !== undefined) clearInterval(l2Heartbeat);
          }
        }
      }

      // ============ AI Analysis ============
      await sendProgress('ANALYZE');

      let aiResult: any;
      try {
        const analyzeTimeoutMs = mode === "deep" ? 120000 : 90000;
        aiResult = await withTimeout(
          analyzeWithAIEnhanced(
            idea,
            tags || [],
            socialData,
            competitorData,
            aggregatedInsights,
            extractedCompetitors,
            llmCandidates,
            mode,
            async ({ index, total, model }) => {
              await sendEvent({
                event: "progress",
                stage: "analyze",
                detailStage: "analyze_model_start",
                progress: Math.min(94, 88 + Math.floor((index / Math.max(total, 1)) * 6)),
                message: `AI分析中（模型 ${index}/${total}: ${model}）...`,
                meta: { modelIndex: index, modelTotal: total, model },
              });
            },
            async ({ index, total, model, error }) => {
              await sendEvent({
                event: "progress",
                stage: "analyze",
                detailStage: "analyze_model_error",
                progress: Math.min(95, 88 + Math.floor((index / Math.max(total, 1)) * 6)),
                message: `模型 ${index}/${total} 失败（${model}）：${String(error).slice(0, 80)}，切换下一个...`,
                meta: { modelIndex: index, modelTotal: total, model },
              });
            },
            async ({ index, total, model, elapsedMs }) => {
              await sendEvent({
                event: "progress",
                stage: "analyze",
                detailStage: "analyze_heartbeat",
                progress: Math.min(95, 88 + Math.floor((index / Math.max(total, 1)) * 6)),
                message: `模型 ${index}/${total} 处理中（${model}，已等待 ${Math.max(1, Math.floor(elapsedMs / 1000))}s）...`,
                meta: { modelIndex: index, modelTotal: total, model, elapsedSeconds: Math.max(1, Math.floor(elapsedMs / 1000)) },
              });
            },
          ),
          analyzeTimeoutMs,
          `analyze_timeout_${analyzeTimeoutMs}ms`,
        );
      } catch (analyzeError) {
        console.error("[Analyze] Timeout or failure, fallback deterministic:", analyzeError);
        await sendEvent({
          event: "progress",
          stage: "analyze",
          detailStage: "analyze_fallback",
          progress: 93,
          message: "AI分析超时，已切换降级分析并继续生成报告...",
        });
        aiResult = buildGroundedFallbackAnalysis(
          idea,
          tags || [],
          socialData,
          aggregatedInsights,
          extractedCompetitors,
          competitorData,
          [String(analyzeError instanceof Error ? analyzeError.message : analyzeError)],
        );
      }

      await sendProgress('SAVE');

      const dataQualityScore = calculateDataQualityScore(socialData, competitorData);
      const evidenceGrade = calculateEvidenceGrade({
        dataQualityScore,
        sampleCount: Number(socialData.totalNotes || 0),
        commentCount: Array.isArray(socialData.sampleComments) ? socialData.sampleComments.length : 0,
        competitorCount: competitorData.length,
      });
      const hasLlmEnabled = !!summaryConfig.apiKey;
      const llmCalls = hasLlmEnabled
        ? (
          (socialSummaries.length + competitorSummaries.length) +
          (socialSummaries.length > 0 || competitorSummaries.length > 0 ? 1 : 0) +
          (extractedCompetitors.length > 0 ? 1 : 0) +
          1
        )
        : 0;
      const promptTokens = Math.ceil((budgeted.stats.char_after + (idea?.length || 0) * 4) / 2);
      const completionTokens = Math.max(500, Math.ceil((JSON.stringify(aiResult).length + JSON.stringify(aggregatedInsights).length) / 2));
      const costBreakdown = estimateCostBreakdown({
        llmCalls,
        promptTokens,
        completionTokens,
        externalApiCalls,
        model: summaryConfig.model,
        latencyMs: Date.now() - startedAt,
        crawlerCalls,
        crawlerLatencyMs,
        crawlerProviderMix,
      });
      (costBreakdown as any).crawler_diagnostic = {
        self_retry_count: crawlSelfRetryCount,
        fallback_used: crawlFallbackUsed,
        fallback_reason: crawlFallbackReason,
      };
      const proofResult = createDefaultProofResult();

      // ============ Save Report ============
      const reportData = {
        validation_id: validation.id,
        market_analysis: aiResult.marketAnalysis || {},
        xiaohongshu_data: socialData,
        competitor_data: competitorData,
        sentiment_analysis: aiResult.sentimentAnalysis || { positive: 33, neutral: 34, negative: 33 },
        ai_analysis: aiResult.aiAnalysis || {},
        dimensions: aiResult.dimensions || [],
        persona: aiResult.persona || null,
        data_summary: {
          socialSummaries,
          competitorSummaries,
          aggregatedInsights,
          extractedCompetitors: extractedCompetitors.map(c => c.name),
          selfRetryCount: crawlSelfRetryCount,
          fallbackUsed: crawlFallbackUsed,
          fallbackReason: crawlFallbackReason,
        },
        data_quality_score: dataQualityScore,
        keywords_used: { coreKeywords: xhsKeywords },
        evidence_grade: evidenceGrade,
        cost_breakdown: costBreakdown,
        proof_result: proofResult,
      };

      let saved = false;
      for (let i = 0; i < 3 && !saved; i++) {
        const { data: existingReport } = await supabase
          .from("validation_reports")
          .select("id")
          .eq("validation_id", validation.id)
          .maybeSingle();
        const writeQuery = existingReport?.id
          ? supabase.from("validation_reports").update(reportData).eq("validation_id", validation.id)
          : supabase.from("validation_reports").insert(reportData);
        const { error } = await writeQuery;
        if (!error) saved = true;
        else await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }

      if (!saved) throw new Error("Failed to save report");


      // Update validation status
      await supabase
        .from("validations")
        .update({ status: "completed", overall_score: aiResult.overallScore })
        .eq("id", validation.id);

      try {
        await syncValidationToTrendingTopics(supabase, {
          idea,
          tags: tags || [],
          socialData,
          overallScore: aiResult.overallScore || 0,
          userId: user.id,
        });
      } catch (syncError) {
        console.error("[TrendingSync] validate-idea-stream sync failed:", syncError);
      }

      await sendEvent({
        event: 'complete',
        result: {
          validationId: validation.id,
          overallScore: aiResult.overallScore,
          overallVerdict: aiResult.overallVerdict
        }
      });

    } catch (error) {
      console.error("Stream validation error:", error);
      
      let errorMessage = "验证过程中发生错误";
      if (error instanceof ValidationError) errorMessage = error.message;
      else if (error instanceof RateLimitError) errorMessage = "请求过于频繁，请稍后再试";
      else if (error instanceof Error) errorMessage = error.message;

      if (supabase && validationId) {
        await supabase
          .from("validations")
          .update({ status: "failed" })
          .eq("id", validationId);
      }
      if (supabase && checkpointKeyword && checkpointUserId) {
        try {
          await persistTopicCacheSnapshot(supabase, {
            keyword: checkpointKeyword,
            userId: checkpointUserId,
            tags: checkpointTags,
            socialData: checkpointSocialData || {},
            competitorData: checkpointCompetitorData || [],
          });
        } catch (cachePersistError) {
          console.error("[Cache] Persist checkpoint on failure failed:", cachePersistError);
        }
      }
      if (supabase && validationId) {
        try {
          await persistValidationCheckpoint(supabase, {
            validationId,
            stage: "failed",
            socialData: checkpointSocialData || {},
            competitorData: checkpointCompetitorData || [],
          });
        } catch (checkpointError) {
          console.error("[Checkpoint] Persist on failure failed:", checkpointError);
        }
      }

      await sendEvent({ event: 'error', error: errorMessage });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, { headers: corsHeaders });
});

// ============ Helper Functions ============

async function expandKeywordsSimple(idea: string, tags: string[], config: RequestConfig): Promise<string[]> {
  const source = String(idea || "").trim();
  const candidates: string[] = [];
  const push = (value: string) => {
    const s = normalizeKeywordForSearch(String(value || "").trim().replace(/\s+/g, " "));
    if (!s) return;
    candidates.push(s.slice(0, 20));
  };

  if (Array.isArray(tags)) {
    for (const tag of tags) push(tag);
  }

  // 原文首句
  push(source.split(/[。！？!?；;\n]/)[0] || source);

  // 按标点切句取前几段
  const segments = source
    .split(/[：:，,。！？!?；;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  for (const seg of segments.slice(0, 6)) push(seg);

  // 中文连续串拆分 2~8 字短词，提高搜索召回
  const zh = source.replace(/[^\u4e00-\u9fff]/g, "");
  if (zh.length >= 4) {
    const lens = [8, 6, 4, 3];
    for (const len of lens) {
      for (let i = 0; i + len <= zh.length && i < 10; i += Math.max(1, Math.floor(len / 2))) {
        push(zh.slice(i, i + len));
      }
    }
  }

  // 常见英文 token
  const enTokens = source.match(/[A-Za-z][A-Za-z0-9+-]{1,20}/g) || [];
  for (const t of enTokens.slice(0, 8)) push(t);

  const unique: string[] = [];
  for (const item of candidates) {
    if (unique.some((x) => isKeywordNearDuplicate(item, x))) continue;
    unique.push(item);
    if (unique.length >= 10) break;
  }
  return unique.length > 0 ? unique : [normalizeKeywordForSearch(source) || "创业想法"];
}

function normalizeCachedSocialData(raw: any) {
  if (!raw || typeof raw !== "object") {
    return { totalNotes: 0, avgLikes: 0, avgComments: 0, avgCollects: 0, sampleNotes: [], sampleComments: [] };
  }
  return {
    totalNotes: Number(raw.totalNotes || raw.total_posts || raw.totalPosts || 0),
    avgLikes: Number(raw.avgLikes || raw.avg_likes || 0),
    avgComments: Number(raw.avgComments || raw.avg_comments || 0),
    avgCollects: Number(raw.avgCollects || raw.avg_collects || 0),
    sampleNotes: Array.isArray(raw.sampleNotes) ? raw.sampleNotes : [],
    sampleComments: Array.isArray(raw.sampleComments)
      ? raw.sampleComments
      : (Array.isArray(raw.comments) ? raw.comments : []),
  };
}

function normalizeCachedCompetitorData(raw: any): SearchResult[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item: any) => ({
      title: String(item.title || ""),
      url: String(item.url || ""),
      snippet: String(item.snippet || item.cleanedContent || ""),
      source: String(item.source || "cache"),
      cleanedContent: item.cleanedContent,
      hasCleanedContent: !!item.hasCleanedContent,
    }));
}

function shouldUseSelfCrawler(userId: string, keyword: string, ratio: number): boolean {
  const safeRatio = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0.2;
  const seed = `${userId}:${keyword}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const bucket = (hash % 1000) / 1000;
  return bucket < safeRatio;
}

async function crawlFromSelfSignals(
  supabase: any,
  keyword: string,
  enableXhs: boolean,
  enableDy: boolean,
  mode: string
) {
  const platforms: string[] = [];
  if (enableXhs) platforms.push("xiaohongshu");
  if (enableDy) platforms.push("douyin");
  if (platforms.length === 0) {
    return { totalNotes: 0, avgLikes: 0, avgComments: 0, avgCollects: 0, sampleNotes: [], sampleComments: [] };
  }

  const limit = mode === "deep" ? 40 : 20;
  const { data: signals } = await supabase
    .from("raw_market_signals")
    .select("id, content, source, likes_count, comments_count, scanned_at")
    .in("source", platforms)
    .ilike("content", `%${keyword}%`)
    .order("scanned_at", { ascending: false })
    .limit(limit);

  const rows = Array.isArray(signals) ? signals : [];
  if (rows.length === 0) {
    return { totalNotes: 0, avgLikes: 0, avgComments: 0, avgCollects: 0, sampleNotes: [], sampleComments: [] };
  }

  const notes = rows.slice(0, mode === "deep" ? 12 : 8).map((s: any) => ({
    note_id: s.id,
    title: `[${s.source}] ${String(s.content || "").slice(0, 40)}`,
    desc: String(s.content || "").slice(0, 300),
    liked_count: Number(s.likes_count || 0),
    comments_count: Number(s.comments_count || 0),
    scanned_at: s.scanned_at,
    _platform: s.source,
  }));

  const comments = rows
    .map((s: any) => String(s.content || "").trim())
    .filter((v: string) => v.length > 12)
    .slice(0, mode === "deep" ? 30 : 16)
    .map((content, i) => ({
      comment_id: `self-${i}`,
      content: content.slice(0, 180),
      like_count: 0,
      user_nickname: "market_signal",
      ip_location: "",
      created_at: rows[i]?.scanned_at || null,
      _platform: rows[i]?.source || "unknown",
    }));

  const avgLikes = Math.round(notes.reduce((sum: number, n: any) => sum + (n.liked_count || 0), 0) / Math.max(1, notes.length));
  const avgComments = Math.round(notes.reduce((sum: number, n: any) => sum + (n.comments_count || 0), 0) / Math.max(1, notes.length));

  return {
    totalNotes: rows.length,
    avgLikes,
    avgComments,
    avgCollects: 0,
    sampleNotes: notes,
    sampleComments: comments,
  };
}

async function persistSocialSignals(
  supabase: any,
  socialData: any
) {
  const notes = Array.isArray(socialData?.sampleNotes) ? socialData.sampleNotes : [];
  const comments = Array.isArray(socialData?.sampleComments) ? socialData.sampleComments : [];
  if (notes.length === 0 && comments.length === 0) return;

  const now = new Date().toISOString();
  const rows: any[] = [];

  for (const note of notes) {
    const content = `${String(note.title || "")}\n${String(note.desc || "")}`.trim();
    if (!content) continue;
    const platform = String(note._platform || "xiaohongshu");
    const sourceId = String(note.note_id || note.aweme_id || note.id || "");
    rows.push({
      content,
      source: platform,
      source_id: sourceId,
      source_url: String(note.url || ""),
      content_type: "post",
      author_name: "",
      likes_count: Number(note.liked_count || note.digg_count || 0),
      comments_count: Number(note.comments_count || note.comment_count || 0),
      content_hash: `${platform}-post-${sourceId || content.slice(0, 64)}`,
      scanned_at: String(note.publish_time || note.create_time || note.scanned_at || now),
      processed_at: now,
    });
  }

  for (const comment of comments) {
    const content = String(comment.content || "").trim();
    if (!content) continue;
    const platform = String(comment._platform || "xiaohongshu");
    const sourceId = String(comment.comment_id || comment.id || "");
    rows.push({
      content,
      source: platform,
      source_id: sourceId,
      source_url: "",
      content_type: "comment",
      author_name: String(comment.user_nickname || ""),
      likes_count: Number(comment.like_count || 0),
      comments_count: 0,
      content_hash: `${platform}-comment-${sourceId || content.slice(0, 64)}`,
      scanned_at: String(comment.create_time || comment.created_at || comment.published_at || now),
      processed_at: now,
    });
  }

  if (rows.length === 0) return;
  await supabase
    .from("raw_market_signals")
    .upsert(rows, { onConflict: "content_hash", ignoreDuplicates: true });
}

function shortenKeywordForTikhub(raw: string): string[] {
  const full = String(raw || "").trim();
  if (!full) return [];
  // Extract Chinese characters
  const zh = full.replace(/[^\u4e00-\u9fff]/g, "");
  const candidates: string[] = [full];
  // Add shortened Chinese-only version
  if (zh.length >= 4) {
    candidates.push(zh.slice(0, 8));
    if (zh.length > 8) candidates.push(zh.slice(0, 5));
  }
  // Add first meaningful segment (split by spaces/punctuation)
  const segments = full.split(/[\s，,。！？!?：:；;、]+/).filter(Boolean);
  if (segments.length > 1 && segments[0].length >= 2) {
    candidates.push(segments[0].slice(0, 12));
  }
  // Deduplicate
  const seen = new Set<string>();
  return candidates.filter(c => {
    const key = c.toLowerCase();
    if (seen.has(key) || !key) return false;
    seen.add(key);
    return true;
  });
}

async function crawlXhsSimple(keyword: string, token: string, mode: string) {
  const emptyResult = { totalNotes: 0, avgLikes: 0, avgComments: 0, sampleNotes: [], sampleComments: [], apiCalls: 0 };
  let apiCalls = 0;
  
  // Try multiple keyword variants (shorter keywords work better on TikHub)
  const keywordVariants = shortenKeywordForTikhub(keyword);
  console.log(`[XHS Simple] Keyword variants to try: ${JSON.stringify(keywordVariants)}`);
  
  let allItems: any[] = [];
  let totalFromApi = 0;

  for (const kw of keywordVariants) {
    if (allItems.length >= 10) break; // enough notes already
    try {
      const url = `https://api.tikhub.io/api/v1/xiaohongshu/web/search_notes?keyword=${encodeURIComponent(kw)}&page=1&sort=general&noteType=_0`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      apiCalls += 1;

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[XHS Simple] Search failed for "${kw}": ${res.status} ${errText.slice(0, 200)}`);
        continue;
      }

      const data = await res.json();
      const items = data?.data?.data?.items || [];
      totalFromApi = Math.max(totalFromApi, Number(data?.data?.data?.total || items.length));
      console.log(`[XHS Simple] Keyword "${kw}" returned ${items.length} items`);
      
      if (items.length === 0) continue;
      allItems = [...allItems, ...items];

      // Fetch page 2 for more notes
      try {
        const url2 = `https://api.tikhub.io/api/v1/xiaohongshu/web/search_notes?keyword=${encodeURIComponent(kw)}&page=2&sort=general&noteType=_0`;
        const res2 = await fetch(url2, { headers: { 'Authorization': `Bearer ${token}` } });
        apiCalls += 1;
        if (res2.ok) {
          const data2 = await res2.json();
          const items2 = data2?.data?.data?.items || [];
          allItems = [...allItems, ...items2];
        } else {
          await res2.text(); // consume body
        }
      } catch (_) { /* ignore page 2 failure */ }
      
      break; // Found results, no need to try more variants
    } catch (e) {
      console.warn(`[XHS Simple] Error for "${kw}":`, e);
    }
  }

  if (allItems.length === 0) {
    console.warn(`[XHS Simple] All keyword variants returned 0 results`);
    return { ...emptyResult, apiCalls };
  }

  const maxNotes = mode === "deep" ? 20 : 10;
  const maxCommentsPerNote = mode === "deep" ? 12 : 6;

  const notes = allItems.slice(0, maxNotes).map((item: any) => ({
    note_id: item.note?.id || '',
    title: '[小红书] ' + (item.note?.title || ''),
    desc: item.note?.desc || '',
    liked_count: item.note?.liked_count || 0,
    comments_count: item.note?.comments_count || 0,
    collected_count: item.note?.collected_count || 0,
    publish_time: item.note?.time || item.note?.publish_time || item.note?.last_update_time || null,
    _platform: 'xiaohongshu'
  }));

  const sampleComments: any[] = [];
  for (const note of notes.slice(0, mode === "deep" ? 10 : 6)) {
    if (!note.note_id) continue;
    try {
      const commentRes = await fetch(
        `https://api.tikhub.io/api/v1/xiaohongshu/web/get_note_comments?note_id=${encodeURIComponent(note.note_id)}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      apiCalls += 1;
      if (!commentRes.ok) {
        await commentRes.text(); // consume body
        continue;
      }
      const commentData = await commentRes.json();
      const comments = commentData?.data?.data?.comments || [];
      sampleComments.push(...comments.slice(0, maxCommentsPerNote).map((c: any) => ({
        comment_id: c.id || '',
        content: c.content || '',
        like_count: c.like_count || 0,
        user_nickname: c.user?.nickname || '',
        ip_location: c.ip_location || '',
        create_time: c.create_time || c.time || null,
        _platform: 'xiaohongshu',
      })));
    } catch (_commentError) {
      // Ignore single-note comment failures to keep the flow resilient.
    }
  }

  const totalLikes = notes.reduce((sum: number, n: any) => sum + n.liked_count, 0);
  const totalComments = notes.reduce((sum: number, n: any) => sum + (n.comments_count || 0), 0);

  return {
    totalNotes: Math.max(totalFromApi, notes.length),
    avgLikes: notes.length > 0 ? Math.round(totalLikes / notes.length) : 0,
    avgComments: notes.length > 0 ? Math.round(totalComments / notes.length) : 0,
    sampleNotes: notes,
    sampleComments,
    apiCalls,
  };
}

async function crawlDouyinSimple(keyword: string, token: string, mode: string) {
  const emptyResult = { totalNotes: 0, avgLikes: 0, avgComments: 0, sampleNotes: [], sampleComments: [], apiCalls: 0 };
  let apiCalls = 0;
  
  const keywordVariants = shortenKeywordForTikhub(keyword);
  console.log(`[Douyin Simple] Keyword variants to try: ${JSON.stringify(keywordVariants)}`);

  let awemeList: any[] = [];
  for (const kw of keywordVariants) {
    if (awemeList.length > 0) break;
    try {
      const url = `https://api.tikhub.io/api/v1/douyin/web/fetch_video_search_result?keyword=${encodeURIComponent(kw)}&offset=0&count=5&sort_type=0`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      apiCalls += 1;

      if (!res.ok) {
        await res.text();
        continue;
      }

      const data = await res.json();
      awemeList = data?.data?.data?.aweme_list || data?.data?.aweme_list || [];
      console.log(`[Douyin Simple] Keyword "${kw}" returned ${awemeList.length} videos`);
      if (awemeList.length > 0) break;
    } catch (e) {
      console.warn(`[Douyin Simple] Error for "${kw}":`, e);
    }
  }

  if (awemeList.length === 0) {
    console.warn(`[Douyin Simple] All keyword variants returned 0 results`);
    return { ...emptyResult, apiCalls };
  }

  const maxVideos = mode === "deep" ? 20 : 10;
  const maxCommentsPerVideo = mode === "deep" ? 12 : 6;
  
  const videos = awemeList.slice(0, maxVideos).map((item: any) => ({
    aweme_id: item.aweme_id || '',
    title: '[抖音] ' + (item.desc || '').slice(0, 30),
    desc: item.desc || '',
    digg_count: item.statistics?.digg_count || 0,
    comment_count: item.statistics?.comment_count || 0,
    create_time: item.create_time || null,
    _platform: 'douyin'
  }));

  const sampleComments: any[] = [];
  for (const video of videos.slice(0, mode === "deep" ? 10 : 6)) {
    if (!video.aweme_id) continue;
    try {
      const commentRes = await fetch(
        `https://api.tikhub.io/api/v1/douyin/web/fetch_video_comments?aweme_id=${encodeURIComponent(video.aweme_id)}&cursor=0&count=${maxCommentsPerVideo}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      apiCalls += 1;
      if (!commentRes.ok) {
        await commentRes.text();
        continue;
      }
      const commentData = await commentRes.json();
      const comments = commentData?.data?.data?.comments || commentData?.data?.comments || [];
      sampleComments.push(...comments.slice(0, maxCommentsPerVideo).map((c: any) => ({
        comment_id: c.cid || '',
        content: c.text || '',
        like_count: c.digg_count || 0,
        user_nickname: c.user?.nickname || '',
        ip_location: c.ip_label || '',
        create_time: c.create_time || null,
        _platform: 'douyin',
      })));
    } catch (_commentError) {
      // Ignore single-video comment failures.
    }
  }

  const totalLikes = videos.reduce((sum: number, v: any) => sum + v.digg_count, 0);
  const totalComments = videos.reduce((sum: number, v: any) => sum + (v.comment_count || 0), 0);

  return {
    totalNotes: videos.length,
    avgLikes: videos.length > 0 ? Math.round(totalLikes / videos.length) : 0,
    avgComments: videos.length > 0 ? Math.round(totalComments / videos.length) : 0,
    sampleNotes: videos,
    sampleComments,
    apiCalls,
  };
}

async function searchCompetitorsSimple(query: string, keys: any): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const searchPromises: Promise<SearchResult[]>[] = [];
  const timeoutMs = Number(Deno.env.get("SEARCH_API_TIMEOUT_MS") || "12000");
  
  if (keys.tavily) {
    searchPromises.push((async () => {
      try {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: keys.tavily,
            query: query,
            search_depth: "basic",
            max_results: 5
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) {
          const data = await res.json();
          return (data.results || []).map((r: any) => ({
            title: r.title,
            url: r.url,
            snippet: r.content || "",
            source: "Tavily"
          }));
        }
      } catch (e) {
        console.error("[Tavily Simple] Error:", e);
      }
      return [];
    })());
  }

  if (keys.bocha) {
    searchPromises.push((async () => {
      try {
        const res = await fetch("https://api.bochaai.com/v1/web-search", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${keys.bocha}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            query: query,
            freshness: "noLimit",
            summary: true,
            count: 5,
            market: "zh-CN",
            language: "zh"
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) {
          const data = await res.json();
          return (data.data?.webPages?.value || []).map((r: any) => ({
            title: r.name || r.title,
            url: r.url,
            snippet: r.snippet || r.description || "",
            source: "Bocha"
          }));
        }
      } catch (e) {
        console.error("[Bocha Simple] Error:", e);
      }
      return [];
    })());
  }

  if (keys.you) {
    searchPromises.push((async () => {
      try {
        const res = await fetch(`https://ydc-index.io/v1/search?query=${encodeURIComponent(query)}&count=5&country=CN`, {
          headers: { "X-API-Key": keys.you },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) {
          const data = await res.json();
          return (data.results?.web || []).map((r: any) => ({
            title: r.title || "",
            url: r.url || "",
            snippet: r.description || r.snippets?.[0] || "",
            source: "You.com"
          }));
        }
      } catch (e) {
        console.error("[You.com Simple] Error:", e);
      }
      return [];
    })());
  }

  const allResults = await Promise.all(searchPromises);
  for (const r of allResults) {
    results.push(...r);
  }

  return results;
}

// 增强版 AI 分析 - 使用聚合摘要
async function analyzeWithAIEnhanced(
  idea: string,
  tags: string[],
  socialData: any,
  competitors: SearchResult[],
  aggregatedInsights: { marketInsight: string; competitiveInsight: string; keyFindings: string[] },
  extractedCompetitors: any[],
  llmRuntimes: LLMRuntime[],
  mode: "quick" | "deep",
  onAttemptProgress?: (payload: { index: number; total: number; model: string; baseUrl: string }) => Promise<void> | void,
  onAttemptFailed?: (payload: { index: number; total: number; model: string; error: string }) => Promise<void> | void,
  onAttemptHeartbeat?: (payload: { index: number; total: number; model: string; elapsedMs: number }) => Promise<void> | void
) {
  if (!Array.isArray(llmRuntimes) || llmRuntimes.length === 0) {
    throw new ValidationError("LLM_UNAVAILABLE:未配置可用大模型。请先在设置中填写主模型或备选模型。");
  }

  // 构建更丰富的上下文
  const competitorNames = extractedCompetitors.map(c => c.name).join(', ') || '未识别';
  const marketInsight = aggregatedInsights.marketInsight || '待分析';
  const competitiveInsight = aggregatedInsights.competitiveInsight || '待分析';

  const prompt = `你是一名资深VC合伙人。基于以下经过整理的市场数据，评估创业想法的可行性。

**创业想法**: "${idea}"
**标签**: ${tags.join(', ') || '无'}

**市场数据摘要**:
- 社媒内容数量: ${socialData.totalNotes}条
- 平均互动量: ${socialData.avgLikes}赞

**市场需求洞察**:
${marketInsight}

**竞争格局洞察**:
${competitiveInsight}

**识别的竞品**: ${competitorNames}

**关键发现**:
${aggregatedInsights.keyFindings.map((f, i) => `${i + 1}. ${f}`).join('\n') || '暂无'}

请输出JSON格式的评估报告:
{
  "overallScore": 0-100,
  "overallVerdict": "一句话总结",
  "marketAnalysis": {
    "targetAudience": "目标用户群",
    "marketSize": "市场规模评估",
    "competitionLevel": "竞争程度"
  },
  "sentimentAnalysis": {"positive": 33, "neutral": 34, "negative": 33},
  "aiAnalysis": {
    "feasibilityScore": 0-100,
    "strengths": ["优势1", "优势2"],
    "weaknesses": ["劣势1", "劣势2"],
    "risks": ["风险1", "风险2"],
    "suggestions": ["建议1", "建议2"]
  },
  "persona": {
    "name": "典型用户名",
    "role": "职业/角色",
    "age": "年龄段",
    "painPoints": ["痛点1", "痛点2"],
    "goals": ["目标1", "目标2"]
  },
  "dimensions": [
    {"dimension": "需求痛感", "score": 50, "reason": "理由"},
    {"dimension": "市场规模", "score": 50, "reason": "理由"},
    {"dimension": "竞争壁垒", "score": 50, "reason": "理由"},
    {"dimension": "PMF潜力", "score": 50, "reason": "理由"}
  ]
}`;

  const errors: string[] = [];
  const totalAnalyzeBudgetMsRaw = Number(
    Deno.env.get(mode === "deep" ? "AI_ANALYZE_BUDGET_MS_DEEP" : "AI_ANALYZE_BUDGET_MS_QUICK")
      || (mode === "deep" ? "180000" : "120000")
  );
  const totalAnalyzeBudgetMs = Number.isFinite(totalAnalyzeBudgetMsRaw)
    ? Math.max(60000, totalAnalyzeBudgetMsRaw)
    : (mode === "deep" ? 180000 : 120000);
  const perModelBudgetMs = Math.max(
    mode === "deep" ? 30000 : 20000,
    Math.floor(totalAnalyzeBudgetMs / Math.max(1, llmRuntimes.length))
  );
  const firstAttemptTimeoutMs = Math.min(mode === "deep" ? 90000 : 60000, perModelBudgetMs);
  const retryAttemptTimeoutMs = Math.max(
    mode === "deep" ? 18000 : 12000,
    Math.floor(firstAttemptTimeoutMs * 0.7)
  );

  for (let i = 0; i < llmRuntimes.length; i++) {
    const runtime = llmRuntimes[i];

    await onAttemptProgress?.({
      index: i + 1,
      total: llmRuntimes.length,
      model: runtime.model,
      baseUrl: runtime.baseUrl,
    });

    const doAnalyzeCall = async (timeoutMs: number, maxTokens: number) => {
      return await requestChatCompletion({
        baseUrl: runtime.baseUrl,
        apiKey: runtime.apiKey,
        model: runtime.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        maxTokens,
        timeoutMs,
        responseFormat: { type: "json_object" },
      });
    };

    let heartbeatElapsedMs = 0;
    const heartbeatIntervalMs = 6000;
    const heartbeat = setInterval(() => {
      heartbeatElapsedMs += heartbeatIntervalMs;
      try {
        void onAttemptHeartbeat?.({
          index: i + 1,
          total: llmRuntimes.length,
          model: runtime.model,
          elapsedMs: heartbeatElapsedMs,
        });
      } catch {
        // no-op
      }
    }, heartbeatIntervalMs);

    try {
      const baseMaxTokens = mode === "deep" ? 1200 : 800;
      const callResult = await doAnalyzeCall(firstAttemptTimeoutMs, baseMaxTokens);
      const content = extractAssistantContent(callResult.json);
      const finishReason = String(callResult.json?.choices?.[0]?.finish_reason || "");
      try {
        return normalizeAnalysisResult(tryParseModelJsonLoose(content));
      } catch (parseErr) {
        if (finishReason === "length") {
          const expandedTokens = mode === "deep" ? 1800 : 1200;
          const retry = await doAnalyzeCall(retryAttemptTimeoutMs, expandedTokens);
          const retryContent = extractAssistantContent(retry.json);
          return normalizeAnalysisResult(tryParseModelJsonLoose(retryContent));
        }
        throw parseErr;
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.error(`[AI Enhanced] Candidate failed model=${runtime.model} base=${runtime.baseUrl}:`, err);
      errors.push(`${runtime.model}@${runtime.baseUrl} -> ${err}`);
      await onAttemptFailed?.({
        index: i + 1,
        total: llmRuntimes.length,
        model: runtime.model,
        error: err,
      });
    } finally {
      clearInterval(heartbeat);
    }
  }

  console.warn("[AI Enhanced] All model candidates failed, fallback to deterministic analysis:", errors);
  return buildGroundedFallbackAnalysis(idea, tags, socialData, aggregatedInsights, extractedCompetitors, competitors, errors);
}

function buildGroundedFallbackAnalysis(
  idea: string,
  tags: string[],
  socialData: any,
  aggregatedInsights: { marketInsight: string; competitiveInsight: string; keyFindings: string[] },
  extractedCompetitors: any[],
  competitors: SearchResult[],
  errors: string[],
) {
  const noteCount = Number(socialData?.totalNotes || 0);
  const avgLikes = Number(socialData?.avgLikes || 0);
  const commentCount = Array.isArray(socialData?.sampleComments) ? socialData.sampleComments.length : 0;
  const competitorCount = Array.isArray(extractedCompetitors) ? extractedCompetitors.length : 0;
  const cleanedCompetitorCount = Array.isArray(competitors)
    ? competitors.filter((c: any) => !!(c?.cleanedContent || c?.snippet)).length
    : 0;

  const evidenceScore = Math.min(100, Math.round(
    Math.min(45, noteCount * 1.2) +
    Math.min(30, commentCount * 2) +
    Math.min(25, cleanedCompetitorCount * 5)
  ));
  const competitionPenalty = competitorCount >= 5 ? 12 : competitorCount >= 3 ? 8 : competitorCount >= 1 ? 4 : 0;
  const overallScore = Math.max(35, Math.min(78, evidenceScore - competitionPenalty));

  const verdict =
    commentCount >= 12
      ? "已获得一定真实用户反馈，建议进入小范围MVP验证。"
      : commentCount >= 4
        ? "已有初步真实反馈，建议继续补样本后再做投入决策。"
        : "当前真实反馈不足，先补充样本再判断需求强度。";

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const risks: string[] = [];
  const suggestions: string[] = [];

  if (noteCount > 0) strengths.push(`已采集到 ${noteCount} 条相关笔记，可用于方向初筛。`);
  if (commentCount > 0) strengths.push(`已采集到 ${commentCount} 条真实评论，具备用户声音证据。`);
  if (cleanedCompetitorCount > 0) strengths.push(`已抓取 ${cleanedCompetitorCount} 条竞品网页内容，可用于竞品对照。`);
  if (strengths.length === 0) strengths.push("暂无可用于决策的强证据。");

  if (commentCount < 6) weaknesses.push("评论样本偏少，用户痛点稳定性不足。");
  if (avgLikes < 20) weaknesses.push("互动强度偏低，需求热度信号有限。");
  if (competitorCount === 0) weaknesses.push("竞品识别不足，竞争格局不完整。");
  if (weaknesses.length === 0) weaknesses.push("当前弱点较少，建议进入真实付费意图实验。");

  if (competitorCount >= 5) risks.push("竞品密度较高，差异化门槛可能不足。");
  if (commentCount < 6) risks.push("样本不足导致结论波动，存在误判风险。");
  if (errors.length > 0) risks.push("AI模型调用失败，结论为规则化保底分析。");
  if (risks.length === 0) risks.push("短期风险可控，重点关注后续转化验证。");

  suggestions.push("继续补充高互动内容下的评论样本，优先覆盖近30天数据。");
  suggestions.push("对竞品卖点/定价/场景做结构化对比，明确差异化定位。");
  suggestions.push("尽快上线付费意图实验页，以转化数据替代主观判断。");

  const targetAudience = tags.length > 0 ? `优先覆盖标签人群：${tags.join(" / ")}` : "需在下一轮采样中进一步识别目标人群";
  const marketSize = noteCount >= 50 ? "讨论量较高，市场关注度较强" : noteCount >= 20 ? "存在一定讨论度，市场规模中等" : "公开讨论量偏低，需扩大关键词与渠道";
  const competitionLevel = competitorCount >= 5 ? "中高" : competitorCount >= 2 ? "中等" : "偏低/待确认";

  return {
    overallScore,
    overallVerdict: verdict,
    marketAnalysis: {
      targetAudience,
      marketSize,
      competitionLevel,
    },
    sentimentAnalysis: commentCount >= 10 ? { positive: 45, neutral: 38, negative: 17 } : { positive: 34, neutral: 45, negative: 21 },
    aiAnalysis: {
      feasibilityScore: overallScore,
      strengths,
      weaknesses,
      risks,
      suggestions,
    },
    persona: {
      name: "待补样本用户",
      role: "潜在目标用户",
      age: "待确认",
      painPoints: [aggregatedInsights.marketInsight || "需要更高效、更低成本地解决核心问题"],
      goals: ["降低时间成本", "获得更稳定的结果"],
    },
    dimensions: [
      { dimension: "需求痛感", score: Math.max(35, Math.min(75, 35 + commentCount * 2)), reason: `基于 ${commentCount} 条评论估算` },
      { dimension: "市场规模", score: Math.max(35, Math.min(75, 30 + Math.round(noteCount * 0.8))), reason: `基于 ${noteCount} 条内容讨论量` },
      { dimension: "竞争壁垒", score: Math.max(35, Math.min(70, 65 - competitorCount * 5)), reason: `基于 ${competitorCount} 个识别竞品估算` },
      { dimension: "PMF潜力", score: Math.max(35, Math.min(75, 40 + commentCount + Math.round(avgLikes / 20))), reason: "基于互动与评论样本估算" },
    ],
  };
}

// 计算数据质量分数
function calculateDataQualityScore(socialData: any, competitorData: any[]): number {
  let score = 0;
  const notesCount = Array.isArray(socialData?.sampleNotes) ? socialData.sampleNotes.length : 0;
  const commentsCount = Array.isArray(socialData?.sampleComments) ? socialData.sampleComments.length : 0;
  const totalNotes = Number(socialData?.totalNotes || 0);
  const avgLikes = Number(socialData?.avgLikes || 0);
  
  // 社媒数据质量 (最高 50 分)
  if (notesCount >= 8) score += 16;
  else if (notesCount >= 4) score += 10;
  
  if (commentsCount >= 16) score += 16;
  else if (commentsCount >= 8) score += 10;
  
  if (totalNotes >= 60) score += 10;
  else if (totalNotes >= 20) score += 6;
  
  if (avgLikes >= 80) score += 8;
  else if (avgLikes >= 20) score += 4;
  
  // 竞品数据质量 (最高 50 分)
  const cleanedCompetitors = competitorData.filter((c: any) => c.hasCleanedContent);
  if (cleanedCompetitors.length >= 4) score += 20;
  else if (cleanedCompetitors.length >= 2) score += 12;
  
  if (competitorData.length >= 8) score += 16;
  else if (competitorData.length >= 3) score += 10;
  
  const deepSearchResults = competitorData.filter((c: any) => c.source?.includes('Deep'));
  if (deepSearchResults.length >= 2) score += 8;
  
  return Math.min(100, score);
}
