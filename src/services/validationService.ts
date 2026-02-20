import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "@/lib/invokeFunction";

export interface ValidationConfig {
  mode: 'quick' | 'deep';
  llmProvider: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  llmFallbacks: Array<{
    baseUrl: string;
    apiKey: string;
    model: string;
  }>;
  tikhubToken: string;
  enableXiaohongshu: boolean;
  enableDouyin: boolean;
  enableSelfCrawler: boolean;
  enableTikhubFallback: boolean;
  searchKeys: {
    bocha: string;
    you: string;
    tavily: string;
  };
  imageGen: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
}

export interface ValidationRequest {
  idea: string;
  tags: string[];
  mode?: 'quick' | 'deep';
  resumeValidationId?: string;
  config?: Partial<ValidationConfig>;
}

export interface ValidationResponse {
  success: boolean;
  validationId: string;
  overallScore: number;
}

export interface Persona {
  name: string;
  role: string;
  age: string;
  income: string;
  painPoints: string[];
  goals: string[];
  techSavviness: number;
  spendingCapacity: number;
  description: string;
}

export interface Validation {
  id: string;
  user_id: string;
  idea: string;
  tags: string[];
  status: "pending" | "processing" | "completed" | "failed";
  overall_score: number | null;
  created_at: string;
  updated_at: string;
  resumable?: boolean;
  resume_hint?: string;
}

export interface CompetitorData {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface DataSummary {
  painPointClusters: {
    theme: string;
    frequency: number;
    sampleQuotes: string[];
    type: 'complaint' | 'question' | 'recommendation' | 'comparison';
  }[];
  competitorMatrix: {
    category: string;
    count: number;
    topPlayers: string[];
    commonPricing?: string;
  }[];
  sentimentBreakdown: {
    positive: number;
    negative: number;
    neutral: number;
    topPositiveThemes: string[];
    topNegativeThemes: string[];
  };
  marketSignals: {
    signal: string;
    evidence: string;
    implication: string;
    confidence: number;
  }[];
  dataQuality: {
    score: number;
    sampleSize: number;
    diversityScore: number;
    recencyScore: number;
    recommendation: string;
  };
  keyInsights: string[];
  crossPlatformResonance?: {
    keyword: string;
    platforms: string[];
    totalMentions: number;
    isHighIntensity: boolean;
    sentiment: 'positive' | 'negative' | 'neutral';
    sampleQuotes: { platform: string; quote: string }[];
  }[];
}

export interface KeywordsUsed {
  coreKeywords?: string[];
  userPhrases?: string[];
  competitorQueries?: string[];
  trendKeywords?: string[];
}

export interface ValidationReport {
  id: string;
  validation_id: string;
  market_analysis: {
    targetAudience: string;
    marketSize: string;
    competitionLevel: string;
    trendDirection: string;
    keywords: string[];
  };
  xiaohongshu_data: {
    totalNotes: number;
    avgLikes: number;
    avgComments: number;
    avgCollects: number;
    totalEngagement: number;
    weeklyTrend: { name: string; value: number }[];
    contentTypes: { name: string; value: number }[];
  };
  competitor_data?: CompetitorData[];
  sentiment_analysis: {
    positive: number;
    neutral: number;
    negative: number;
    topPositive: string[];
    topNegative: string[];
  };
  ai_analysis: {
    feasibilityScore: number;
    overallVerdict?: string;
    strengths: string[];
    weaknesses: string[];
    suggestions: (string | { action: string; reference?: string; expectedResult?: string })[];
    risks: string[];
  };
  persona?: Persona;
  dimensions: { dimension: string; score: number; reason?: string }[];
  // Phase 1 new fields
  data_summary?: DataSummary;
  data_quality_score?: number;
  keywords_used?: KeywordsUsed;
  evidence_grade?: 'A' | 'B' | 'C' | 'D';
  cost_breakdown?: {
    llm_calls: number;
    prompt_tokens: number;
    completion_tokens: number;
    external_api_calls: number;
    est_cost: number;
    model?: string;
    latency_ms?: number;
    crawler_calls?: number;
    crawler_latency_ms?: number;
    crawler_provider_mix?: Record<string, number>;
  };
  proof_result?: {
    paid_intent_rate: number;
    waitlist_rate: number;
    sample_uv: number;
    verdict: string;
    confidence_interval_low?: number;
    confidence_interval_high?: number;
  };
  created_at: string;
}

export interface FullValidation {
  validation: Validation;
  report: ValidationReport | null;
}

const isAuthBypassEnabled = () => {
  const raw = String(import.meta.env.VITE_DISABLE_APP_AUTH || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};

const ensureSignedInUnlessBypass = async () => {
  if (isAuthBypassEnabled()) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("请先登录");
  }
};

// 创建新验证
export async function createValidation(request: ValidationRequest): Promise<ValidationResponse> {
  await ensureSignedInUnlessBypass();

  const response = await invokeFunction("validate-idea", {
    body: request,
  }, !isAuthBypassEnabled());

  if (response.error) {
    throw new Error(response.error.message || "验证失败");
  }

  return response.data;
}

// 获取验证详情
export async function getValidation(validationId: string): Promise<FullValidation> {
  await ensureSignedInUnlessBypass();

  const { data, error } = await invokeFunction<FullValidation>("get-validation", {
    body: { id: validationId },
  }, !isAuthBypassEnabled());

  if (error) {
    throw new Error(error.message || "获取验证详情失败");
  }

  return data;
}

// 获取验证列表
export async function listValidations(): Promise<Validation[]> {
  await ensureSignedInUnlessBypass();

  const response = await invokeFunction<{ validations: Validation[] }>("list-validations", {
    body: {},
  }, !isAuthBypassEnabled());

  if (response.error) {
    throw new Error(response.error.message || "获取验证列表失败");
  }

  return response.data.validations;
}

// 删除验证
export async function deleteValidation(validationId: string): Promise<void> {
  await ensureSignedInUnlessBypass();

  const response = await invokeFunction("delete-validation", {
    body: { validationId },
  }, !isAuthBypassEnabled());

  if (response.error) {
    throw new Error(response.error.message || "删除失败");
  }
}

export interface SSEProgressEvent {
  event: 'progress' | 'complete' | 'error';
  stage?: string;
  detailStage?: string;
  progress?: number;
  message?: string;
  meta?: Record<string, unknown>;
  result?: {
    validationId: string;
    overallScore: number;
    overallVerdict?: string;
  };
  error?: string;
}

const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const sanitizeToken = (token?: string | null) => {
  const raw = (token || "").trim();
  if (!raw) return '';
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim();
  }
  return raw.replace(/\r?\n/g, '').trim();
};
const isJwtLike = (token?: string | null) => jwtPattern.test(sanitizeToken(token));
const projectRefPattern = /^https?:\/\/([a-z0-9-]+)\.supabase\.co/i;

type JwtPayload = {
  exp?: number;
  iss?: string;
  ref?: string;
};

const getCurrentProjectRef = () => {
  const baseUrl = String(import.meta.env.VITE_SUPABASE_URL || '');
  const matched = baseUrl.match(projectRefPattern);
  return matched?.[1] || '';
};

const decodeJwtPayload = (token?: string | null): JwtPayload | null => {
  const safeToken = sanitizeToken(token);
  if (!isJwtLike(safeToken)) return null;
  const payloadPart = safeToken.split('.')[1];
  if (!payloadPart) return null;
  try {
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const parsed = JSON.parse(atob(padded));
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as JwtPayload;
  } catch {
    return null;
  }
};

const extractProjectRefFromPayload = (payload: JwtPayload | null) => {
  if (!payload) return '';
  if (typeof payload.ref === 'string' && payload.ref.trim()) return payload.ref.trim();
  if (typeof payload.iss === 'string') {
    const matched = payload.iss.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
    if (matched?.[1]) return matched[1];
  }
  return '';
};

const tokenExpiringSoon = (payload: JwtPayload | null, skewSeconds = 30) => {
  if (!payload || typeof payload.exp !== 'number') return false;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now + skewSeconds;
};

const safeRefreshSession = async () => {
  const refreshFn = (supabase.auth as any).refreshSession;
  if (typeof refreshFn !== 'function') {
    return { data: { session: null }, error: new Error('refreshSession unavailable') };
  }
  const result = await refreshFn.call(supabase.auth);
  if (!result || typeof result !== 'object') {
    return { data: { session: null }, error: new Error('refreshSession invalid result') };
  }
  return {
    data: (result as any).data ?? { session: null },
    error: (result as any).error ?? null,
  };
};

const ensureStreamAccessToken = async (initialToken: string): Promise<string | null> => {
  let token = sanitizeToken(initialToken);
  const currentRef = getCurrentProjectRef();

  for (let attempt = 0; attempt < 3; attempt++) {
    if (!isJwtLike(token)) {
      const refreshed = await safeRefreshSession();
      const refreshedToken = sanitizeToken(refreshed.data.session?.access_token);
      if (isJwtLike(refreshedToken)) {
        token = refreshedToken;
        continue;
      }
      return null;
    }

    const payload = decodeJwtPayload(token);
    const tokenRef = extractProjectRefFromPayload(payload);
    if ((currentRef && tokenRef && currentRef !== tokenRef) || tokenExpiringSoon(payload)) {
      const refreshed = await safeRefreshSession();
      const refreshedToken = sanitizeToken(refreshed.data.session?.access_token);
      if (isJwtLike(refreshedToken)) {
        token = refreshedToken;
        continue;
      }
      return null;
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      return isJwtLike(token) ? token : null;
    }

    const refreshed = await safeRefreshSession();
    const refreshedToken = sanitizeToken(refreshed.data.session?.access_token);
    if (!refreshed.error && isJwtLike(refreshedToken) && refreshedToken !== token) {
      token = refreshedToken;
      continue;
    }
  }

  return null;
};

// 新增流式验证函数
export function createValidationStream(
  request: ValidationRequest,
  onProgress: (event: SSEProgressEvent) => void,
  onComplete: (result: ValidationResponse) => void,
  onError: (error: string) => void
): { abort: () => void } {
  const controller = new AbortController();

  (async () => {
    const bypassAuth = isAuthBypassEnabled();
    let accessToken = "";
    if (!bypassAuth) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        onError("请先登录");
        return;
      }

      accessToken = (await ensureStreamAccessToken(session.access_token || "")) || "";
      if (!accessToken) {
        onError("登录态已失效，请重新登录");
        return;
      }
    }

    try {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-idea-stream`;
      const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const doFetch = (token: string) => fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          ...(apikey ? { apikey } : {}),
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      let response = await doFetch(accessToken);

      // One-shot retry for transient token mismatch.
      if (!bypassAuth && response.status === 401) {
        const refreshedToken = await ensureStreamAccessToken(accessToken);
        if (refreshedToken && refreshedToken !== accessToken) {
          accessToken = refreshedToken;
          response = await doFetch(refreshedToken);
        }
      }

      if (!response.ok) {
        let detail = "";
        try {
          detail = await response.text();
        } catch {
          detail = "";
        }
        if (response.status === 401) {
          onError('登录态已失效，请重新登录');
          return;
        }
        throw new Error(detail || `SSE 连接失败(${response.status})`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const eventData: SSEProgressEvent = JSON.parse(line.slice(6));

              if (eventData.event === 'progress') {
                onProgress(eventData);
              } else if (eventData.event === 'complete') {
                onComplete({
                  success: true,
                  validationId: eventData.result!.validationId,
                  overallScore: eventData.result!.overallScore,
                });
              } else if (eventData.event === 'error') {
                onError(eventData.error || '验证失败');
              }
            } catch (e) {
              console.error("Failed to parse SSE event:", line, e);
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        onError((error as Error).message || '验证过程中发生错误');
      }
    }
  })();

  return { abort: () => controller.abort() };
}
