import { supabase } from "@/integrations/supabase/client";

export interface ValidationConfig {
  mode: 'quick' | 'deep';
  llmProvider: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
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

// 创建新验证
export async function createValidation(request: ValidationRequest): Promise<ValidationResponse> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("请先登录");
  }

  const response = await supabase.functions.invoke("validate-idea", {
    body: request,
  });

  if (response.error) {
    throw new Error(response.error.message || "验证失败");
  }

  return response.data;
}

// 获取验证详情
export async function getValidation(validationId: string): Promise<FullValidation> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("请先登录");
  }

  const { data, error } = await supabase.functions.invoke("get-validation", {
    body: { id: validationId },
  });

  if (error) {
    throw new Error(error.message || "获取验证详情失败");
  }

  return data;
}

// 获取验证列表
export async function listValidations(): Promise<Validation[]> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("请先登录");
  }

  const response = await supabase.functions.invoke("list-validations", {
    body: {},
  });

  if (response.error) {
    throw new Error(response.error.message || "获取验证列表失败");
  }

  return response.data.validations;
}

// 删除验证
export async function deleteValidation(validationId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("请先登录");
  }

  const response = await supabase.functions.invoke("delete-validation", {
    body: { validationId },
  });

  if (response.error) {
    throw new Error(response.error.message || "删除失败");
  }
}

export interface SSEProgressEvent {
  event: 'progress' | 'complete' | 'error';
  stage?: string;
  progress?: number;
  message?: string;
  result?: {
    validationId: string;
    overallScore: number;
    overallVerdict?: string;
  };
  error?: string;
}

// 新增流式验证函数
export function createValidationStream(
  request: ValidationRequest,
  onProgress: (event: SSEProgressEvent) => void,
  onComplete: (result: ValidationResponse) => void,
  onError: (error: string) => void
): { abort: () => void } {
  const controller = new AbortController();

  (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      onError("请先登录");
      return;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-idea-stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        }
      );

      if (!response.ok) throw new Error('SSE 连接失败');

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
