import { supabase } from "@/integrations/supabase/client";

export interface ValidationRequest {
  idea: string;
  tags: string[];
}

export interface ValidationResponse {
  success: boolean;
  validationId: string;
  overallScore: number;
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
  sentiment_analysis: {
    positive: number;
    neutral: number;
    negative: number;
    topPositive: string[];
    topNegative: string[];
  };
  ai_analysis: {
    feasibilityScore: number;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    risks: string[];
  };
  dimensions: { dimension: string; score: number }[];
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

  const response = await supabase.functions.invoke("get-validation", {
    body: {},
    headers: {},
  });

  // 使用查询参数方式
  const { data, error } = await supabase.functions.invoke(`get-validation?id=${validationId}`, {
    method: "GET",
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
