/**
 * 分层摘要系统
 * 
 * Layer 1: 单条数据摘要 (150字)
 *   - 社媒帖子 → 提取痛点和需求
 *   - 竞品页面 → 提取产品定位和定价
 * 
 * Layer 2: 聚合摘要 (200字)
 *   - 社媒摘要 → 市场需求总结
 *   - 竞品摘要 → 竞争格局总结
 */

export interface SummaryConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface Layer1Summary {
  content: string;
  type: 'social_post' | 'competitor_page';
  originalLength: number;
  summaryLength: number;
}

export interface Layer2Summary {
  marketInsight: string;
  competitiveInsight: string;
  keyFindings: string[];
}

const PROMPTS = {
  social_post: `提取以下社媒帖子的核心信息，150字以内:
1. 用户表达的痛点或需求
2. 情感倾向 (正面/负面/中性)
3. 付费意愿信号 (如有)

内容: "{content}"

仅输出摘要，不要其他内容。`,

  competitor_page: `提取以下竞品页面的核心信息，150字以内:
1. 产品定位和目标用户
2. 核心功能/卖点
3. 定价策略 (如可见)

内容: "{content}"

仅输出摘要，不要其他内容。`,

  aggregate: `基于以下数据，分别总结市场需求和竞争格局，各200字以内。

**社媒用户声音摘要**:
{socialSummaries}

**竞品信息摘要**:
{competitorSummaries}

输出JSON格式:
{
  "marketInsight": "市场需求总结...",
  "competitiveInsight": "竞争格局总结...",
  "keyFindings": ["发现1", "发现2", "发现3"]
}`
};

/**
 * Layer 1: 单条数据摘要
 * @param content 原始内容
 * @param contentType 内容类型
 * @param config LLM 配置
 */
export async function summarizeSingle(
  content: string,
  contentType: 'social_post' | 'competitor_page',
  config: SummaryConfig
): Promise<Layer1Summary> {
  // 内容太短不需要摘要
  if (content.length < 100) {
    return {
      content: content.trim(),
      type: contentType,
      originalLength: content.length,
      summaryLength: content.length
    };
  }

  const maxContentLength = contentType === 'social_post' ? 1000 : 2000;
  const truncatedContent = content.slice(0, maxContentLength);
  
  const prompt = PROMPTS[contentType].replace('{content}', truncatedContent);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 300
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.choices[0]?.message?.content?.trim() || '';

    return {
      content: summary || truncatedContent.slice(0, 150),
      type: contentType,
      originalLength: content.length,
      summaryLength: summary.length
    };
  } catch (e) {
    console.error('[Summarizer] L1 error:', e);
    // 降级：返回截断的原始内容
    return {
      content: truncatedContent.slice(0, 150),
      type: contentType,
      originalLength: content.length,
      summaryLength: 150
    };
  }
}

/**
 * 批量摘要 (Layer 1)
 * @param items 待摘要内容列表
 * @param config LLM 配置
 * @param maxConcurrent 最大并发数
 */
export async function summarizeBatch(
  items: { content: string; type: 'social_post' | 'competitor_page' }[],
  config: SummaryConfig,
  maxConcurrent = 5
): Promise<Layer1Summary[]> {
  const results: Layer1Summary[] = [];

  for (let i = 0; i < items.length; i += maxConcurrent) {
    const batch = items.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(item => summarizeSingle(item.content, item.type, config))
    );
    results.push(...batchResults);

    // 批次间延迟
    if (i + maxConcurrent < items.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return results;
}

/**
 * Layer 2: 聚合摘要
 * @param socialSummaries 社媒摘要列表
 * @param competitorSummaries 竞品摘要列表
 * @param config LLM 配置
 */
export async function aggregateSummaries(
  socialSummaries: string[],
  competitorSummaries: string[],
  config: SummaryConfig
): Promise<Layer2Summary> {
  const defaultResult: Layer2Summary = {
    marketInsight: '',
    competitiveInsight: '',
    keyFindings: []
  };

  // 如果数据太少，跳过聚合
  if (socialSummaries.length === 0 && competitorSummaries.length === 0) {
    return defaultResult;
  }

  const socialText = socialSummaries.length > 0 
    ? socialSummaries.slice(0, 10).join('\n---\n')
    : '(暂无社媒数据)';
    
  const competitorText = competitorSummaries.length > 0
    ? competitorSummaries.slice(0, 5).join('\n---\n')
    : '(暂无竞品数据)';

  const prompt = PROMPTS.aggregate
    .replace('{socialSummaries}', socialText)
    .replace('{competitorSummaries}', competitorText);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      }),
      signal: AbortSignal.timeout(45000)
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '{}';

    // 解析 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      marketInsight: parsed.marketInsight || '',
      competitiveInsight: parsed.competitiveInsight || '',
      keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : []
    };
  } catch (e) {
    console.error('[Summarizer] L2 error:', e);
    return defaultResult;
  }
}

/**
 * 计算摘要带来的 token 节省
 */
export function calculateTokenSavings(
  originalLength: number,
  summaryLength: number
): { saved: number; percentage: number } {
  // 粗略估算: 1 token ≈ 1.5 个中文字符 或 4 个英文字符
  const estimatedOriginalTokens = Math.ceil(originalLength / 2);
  const estimatedSummaryTokens = Math.ceil(summaryLength / 2);
  const saved = estimatedOriginalTokens - estimatedSummaryTokens;
  const percentage = originalLength > 0 
    ? Math.round((saved / estimatedOriginalTokens) * 100) 
    : 0;

  return { saved, percentage };
}
