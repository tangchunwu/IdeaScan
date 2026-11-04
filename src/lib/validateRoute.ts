export interface ValidateRouteIntent {
  idea: string;
  auto: boolean;
  resumeValidationId: string;
  country: string;
  industry: string;
  platforms: string[];
  tags: string[];
  source: string;
}

const validationPlatforms = new Set(["xiaohongshu", "douyin", "tiktok", "instagram", "youtube", "reddit", "twitter", "threads"]);

function parseList(value: string | null): string[] {
  return [...new Set((value || "").split(",").map(item => item.trim()).filter(Boolean))];
}

export function getValidateRouteIntent(params: URLSearchParams): ValidateRouteIntent {
  return {
    idea: params.get("idea") || params.get("topic") || "",
    auto: params.get("auto") === "true",
    resumeValidationId: params.get("resumeValidationId") || "",
    country: params.get("country") || "",
    industry: params.get("industry") || "",
    platforms: parseList(params.get("platforms")).filter(platform => validationPlatforms.has(platform)),
    tags: parseList(params.get("tags")).slice(0, 5),
    source: params.get("source") || "",
  };
}

export function createValidateAuthRedirect(params: URLSearchParams): string {
  const query = params.toString();
  const destination = query ? `/validate?${query}` : "/validate";
  return `/auth?redirect=${encodeURIComponent(destination)}`;
}

export function getDiscoverValidationUrl(topic: string): string {
  return `/validate?idea=${encodeURIComponent(topic)}`;
}

export function getOpportunityValidationUrl(input: {
  title: string;
  problem: string;
  targetUsers: string;
  country: string;
  industry: string;
  platforms: string[];
}): string {
  // 国家和行业进入实际分析正文，不能仅作为未消费的查询参数。
  const title = input.title.slice(0, 80);
  const context = [
    `目标用户：${input.targetUsers.slice(0, 80)}`,
    `目标国家：${input.country.slice(0, 80)}`,
    `目标行业：${input.industry.slice(0, 100)}`,
  ].join("\n");
  // 验证表单上限为 500 字，优先保留市场上下文，再截断问题摘要。
  const problemBudget = Math.max(0, 500 - `${title}\n用户痛点：\n${context}`.length);
  const idea = `${title}\n用户痛点：${input.problem.slice(0, problemBudget)}\n${context}`;
  const params = new URLSearchParams({
    idea,
    country: input.country,
    industry: input.industry,
    platforms: input.platforms.join(","),
    tags: input.industry,
    source: "opportunity-radar",
  });
  return `/validate?${params.toString()}`;
}
