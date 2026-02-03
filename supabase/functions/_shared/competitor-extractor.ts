/**
 * 竞品名称提取 + 二次深度搜索
 * 
 * 1. 从初次搜索结果中用 LLM 提取具体竞品名称
 * 2. 针对提取的竞品执行二次精准搜索
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  cleanedContent?: string;
  hasCleanedContent?: boolean;
}

export interface ExtractedCompetitor {
  name: string;
  category?: string;
  confidence: number;
}

export interface DeepSearchResult extends SearchResult {
  competitorName: string;
  searchType: 'pricing' | 'review' | 'feature';
}

export interface SearchKeys {
  tavily?: string;
  bocha?: string;
  you?: string;
}

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * 从搜索结果中提取竞品名称
 * @param searchResults 初次搜索结果
 * @param ideaContext 创业想法上下文
 * @param config LLM 配置
 */
export async function extractCompetitorNames(
  searchResults: SearchResult[],
  ideaContext: string,
  config: LLMConfig
): Promise<ExtractedCompetitor[]> {
  if (searchResults.length === 0) {
    return [];
  }

  // 构建上下文
  const context = searchResults
    .slice(0, 10)
    .map(r => `- ${r.title}: ${(r.snippet || '').slice(0, 200)}`)
    .join('\n');

  const prompt = `基于以下搜索结果，提取与"${ideaContext}"相关的具体竞品/产品/服务名称。

搜索结果:
${context}

要求:
1. 只提取具体的产品或公司名称
2. 不要泛化的描述
3. 最多5个
4. 评估每个竞品的相关性置信度 (0-1)

输出JSON格式:
[
  {"name": "竞品名称", "category": "类别", "confidence": 0.9},
  ...
]`;

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
        temperature: 0.2
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '[]';

    // 解析 JSON 数组
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    return parsed
      .filter((item: any) => 
        typeof item.name === 'string' && 
        item.name.length > 0 &&
        item.name.length < 50
      )
      .slice(0, 5)
      .map((item: any) => ({
        name: item.name.trim(),
        category: item.category || undefined,
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.5
      }));
  } catch (e) {
    console.error('[CompetitorExtractor] Extract error:', e);
    return [];
  }
}

/**
 * 基于竞品名称进行二次深度搜索
 * @param competitors 提取的竞品列表
 * @param searchKeys 搜索 API 密钥
 */
export async function searchCompetitorDetails(
  competitors: ExtractedCompetitor[],
  searchKeys: SearchKeys
): Promise<DeepSearchResult[]> {
  const results: DeepSearchResult[] = [];
  
  // 只搜索置信度较高的前3个竞品
  const topCompetitors = competitors
    .filter(c => c.confidence >= 0.5)
    .slice(0, 3);

  for (const competitor of topCompetitors) {
    const searchQueries = [
      { query: `${competitor.name} 定价 价格`, type: 'pricing' as const },
      { query: `${competitor.name} 用户评价 口碑`, type: 'review' as const },
    ];

    for (const { query, type } of searchQueries) {
      const searchResult = await searchSingle(query, searchKeys);
      
      for (const result of searchResult) {
        results.push({
          ...result,
          competitorName: competitor.name,
          searchType: type
        });
      }

      // 速率限制
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return results;
}

/**
 * 单次搜索 (使用可用的 API)
 */
async function searchSingle(
  query: string, 
  keys: SearchKeys
): Promise<SearchResult[]> {
  // 优先使用 Tavily
  if (keys.tavily) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: keys.tavily,
          query,
          search_depth: "basic",
          max_results: 3
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (res.ok) {
        const data = await res.json();
        return (data.results || []).map((r: any) => ({
          title: r.title || '',
          url: r.url || '',
          snippet: r.content || '',
          source: 'Tavily-Deep'
        }));
      }
    } catch (e) {
      console.error('[DeepSearch] Tavily error:', e);
    }
  }

  // 备选: Bocha
  if (keys.bocha) {
    try {
      const res = await fetch("https://api.bochaai.com/v1/web-search", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${keys.bocha}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query,
          freshness: "noLimit",
          summary: true,
          count: 3,
          market: "zh-CN",
          language: "zh"
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (res.ok) {
        const data = await res.json();
        return (data.data?.webPages?.value || []).map((r: any) => ({
          title: r.name || r.title || '',
          url: r.url || '',
          snippet: r.snippet || r.description || '',
          source: 'Bocha-Deep'
        }));
      }
    } catch (e) {
      console.error('[DeepSearch] Bocha error:', e);
    }
  }

  return [];
}

/**
 * 合并初次搜索和二次搜索结果
 */
export function mergeSearchResults(
  initialResults: SearchResult[],
  deepResults: DeepSearchResult[]
): SearchResult[] {
  // 去重 (按 URL)
  const urlSet = new Set<string>();
  const merged: SearchResult[] = [];

  for (const result of initialResults) {
    if (result.url && !urlSet.has(result.url)) {
      urlSet.add(result.url);
      merged.push(result);
    }
  }

  for (const result of deepResults) {
    if (result.url && !urlSet.has(result.url)) {
      urlSet.add(result.url);
      merged.push({
        title: `[${result.competitorName}] ${result.title}`,
        url: result.url,
        snippet: result.snippet,
        source: result.source,
      });
    }
  }

  return merged;
}

/**
 * 生成竞品分析摘要
 */
export function generateCompetitorSummary(
  competitors: ExtractedCompetitor[],
  deepResults: DeepSearchResult[]
): string {
  if (competitors.length === 0) {
    return '未发现明显竞品';
  }

  const lines: string[] = ['发现以下竞品:'];
  
  for (const comp of competitors) {
    const relatedResults = deepResults.filter(r => r.competitorName === comp.name);
    const pricingInfo = relatedResults.find(r => r.searchType === 'pricing');
    const reviewInfo = relatedResults.find(r => r.searchType === 'review');

    let line = `- ${comp.name}`;
    if (comp.category) line += ` (${comp.category})`;
    if (pricingInfo) line += ` - 有定价信息`;
    if (reviewInfo) line += ` - 有用户评价`;
    
    lines.push(line);
  }

  return lines.join('\n');
}
