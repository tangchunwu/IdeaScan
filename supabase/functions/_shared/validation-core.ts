/**
 * Shared Validation Core Logic
 * 
 * Contains reusable functions for validation processing
 * Used by both sync (validate-idea) and stream (validate-idea-stream) functions
 */

// ============ Progress Stages ============

export interface ProgressStage {
  stage: string;
  progress: number;
  message: string;
}

export const VALIDATION_STAGES = {
  PARSING: { stage: 'parsing', progress: 5, message: '解析创意想法...' },
  EXPANDING: { stage: 'expanding', progress: 15, message: '智能扩展关键词...' },
  CRAWLING_XHS: { stage: 'crawling', progress: 30, message: '抓取小红书数据...' },
  CRAWLING_DY: { stage: 'crawling', progress: 45, message: '抓取抖音数据...' },
  CRAWLING_DONE: { stage: 'crawling', progress: 55, message: '社媒数据抓取完成' },
  SEARCHING: { stage: 'searching', progress: 65, message: '搜索竞品信息...' },
  SUMMARIZING: { stage: 'summarizing', progress: 75, message: '汇总分析数据...' },
  ANALYZING: { stage: 'analyzing', progress: 88, message: 'AI深度分析中...' },
  SAVING: { stage: 'saving', progress: 95, message: '保存验证报告...' },
  COMPLETE: { stage: 'complete', progress: 100, message: '验证完成' },
} as const;

// ============ Default Values ============

export const DEFAULT_DIMENSION_REASONS: Record<string, string> = {
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

export const DEFAULT_DIMENSIONS = [
  { dimension: "需求痛感", score: 50, reason: DEFAULT_DIMENSION_REASONS["需求痛感"] },
  { dimension: "PMF潜力", score: 50, reason: DEFAULT_DIMENSION_REASONS["PMF潜力"] },
  { dimension: "市场规模", score: 50, reason: DEFAULT_DIMENSION_REASONS["市场规模"] },
  { dimension: "差异化", score: 50, reason: DEFAULT_DIMENSION_REASONS["差异化"] },
  { dimension: "可行性", score: 50, reason: DEFAULT_DIMENSION_REASONS["可行性"] },
  { dimension: "盈利能力", score: 50, reason: DEFAULT_DIMENSION_REASONS["盈利能力"] },
];

// ============ JSON Parsing Utilities ============

export function extractFirstJsonObject(text: string): string | null {
  if (!text) return null;

  const cleaned = text
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;

  return cleaned.slice(first, last + 1);
}

export function repairJson(json: string): string {
  let repaired = json;
  repaired = repaired.replace(/,(\s*[}\]])/g, "$1");
  repaired = repaired.replace(/\](\s+)\[/g, "],$1[");
  repaired = repaired.replace(/\](\s+)\{/g, "],$1{");
  repaired = repaired.replace(/\](\s+)"/g, "],$1\"");
  repaired = repaired.replace(/\}(\s+)\{/g, "},$1{");
  repaired = repaired.replace(/\}(\s+)"/g, "},$1\"");
  repaired = repaired.replace(/"(\s*\n\s*)"/g, "\",$1\"");
  repaired = repaired.replace(/\](\s*\n\s*)"([a-zA-Z_])/g, "],$1\"$2");
  return repaired;
}

export function completeTruncatedJson(json: string): string {
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    if (escape) { escape = false; continue; }
    if (char === '\\' && inString) { escape = true; continue; }
    if (char === '"' && !escape) { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') openBraces++;
      else if (char === '}') openBraces--;
      else if (char === '[') openBrackets++;
      else if (char === ']') openBrackets--;
    }
  }

  let completed = json;
  if (inString) completed += '"';
  completed = completed.replace(/,\s*"[^"]*":\s*("[^"]*)?$/g, '');
  completed = completed.replace(/,\s*"[^"]*":\s*\[?\s*$/g, '');
  for (let i = 0; i < openBrackets; i++) completed += ']';
  for (let i = 0; i < openBraces; i++) completed += '}';
  return completed;
}

export function parseJsonFromModelOutput<T = unknown>(text: string): T {
  const json = extractFirstJsonObject(text);
  if (!json) {
    console.error("AI JSON parse failed. Raw (first 1200 chars):", text.slice(0, 1200));
    throw new Error("AI did not return valid JSON");
  }

  try {
    return JSON.parse(json) as T;
  } catch (_firstError) {
    const repaired = repairJson(json);
    try {
      return JSON.parse(repaired) as T;
    } catch (_secondError) {
      const completed = completeTruncatedJson(repaired);
      try {
        console.log("Attempting to parse completed JSON...");
        return JSON.parse(completed) as T;
      } catch (_thirdError) {
        console.error("AI JSON parse failed. Raw (first 1200 chars):", text.slice(0, 1200));
        throw new Error("Analysis processing failed. Please try again.");
      }
    }
  }
}

// ============ Data Normalization ============

export interface DimensionData {
  dimension: string;
  score: number;
  reason: string;
}

export interface PersonaData {
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

/**
 * Normalize AI dimensions output with fallback defaults
 */
export function normalizeDimensions(rawDimensions: any[]): DimensionData[] {
  if (!Array.isArray(rawDimensions) || rawDimensions.length === 0) {
    return DEFAULT_DIMENSIONS;
  }

  return rawDimensions.map((d: any) => ({
    dimension: d.dimension || "未知维度",
    score: typeof d.score === 'number' ? Math.min(100, Math.max(0, d.score)) : 50,
    reason: (d.reason && d.reason !== "待AI分析" && d.reason.length > 5)
      ? d.reason
      : (DEFAULT_DIMENSION_REASONS[d.dimension] || `基于市场数据对${d.dimension || "该维度"}的综合评估`)
  }));
}

/**
 * Normalize AI persona output with fallback defaults
 */
export function normalizePersona(rawPersona: any, idea: string, marketAnalysis?: any): PersonaData | null {
  if (rawPersona && rawPersona.name && rawPersona.role) {
    return {
      name: rawPersona.name,
      role: rawPersona.role,
      age: rawPersona.age || "25-45岁",
      income: rawPersona.income || "中等收入",
      painPoints: Array.isArray(rawPersona.painPoints) && rawPersona.painPoints.length > 0
        ? rawPersona.painPoints
        : ["需要更高效的解决方案", "现有选择无法满足需求"],
      goals: Array.isArray(rawPersona.goals) && rawPersona.goals.length > 0
        ? rawPersona.goals
        : ["找到更好的产品体验", "提升生活/工作效率"],
      techSavviness: typeof rawPersona.techSavviness === 'number' ? rawPersona.techSavviness : 65,
      spendingCapacity: typeof rawPersona.spendingCapacity === 'number' ? rawPersona.spendingCapacity : 60,
      description: rawPersona.description || `对"${idea.slice(0, 30)}..."有需求的核心用户群体`
    };
  }

  // Generate from market analysis if available
  if (marketAnalysis?.targetAudience) {
    const targetAudience = String(marketAnalysis.targetAudience || "");
    return {
      name: "目标用户",
      role: targetAudience.split(/[、,，]/)[0]?.slice(0, 20) || "潜在用户",
      age: "25-45岁",
      income: "中等收入",
      painPoints: ["需要更高效的解决方案", "现有选择无法满足需求"],
      goals: ["找到更好的产品体验", "提升生活/工作效率"],
      techSavviness: 65,
      spendingCapacity: 60,
      description: `对"${idea.slice(0, 30)}..."感兴趣的${targetAudience.slice(0, 50)}`
    };
  }

  return null;
}
