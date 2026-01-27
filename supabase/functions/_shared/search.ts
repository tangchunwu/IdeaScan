/**
 * Shared Search Module
 * Competitor search using various providers (Bocha, You.com, Tavily)
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface SearchKeys {
  bocha?: string;
  you?: string;
  tavily?: string;
}

export interface SearchConfig {
  providers: ('bocha' | 'you' | 'tavily')[];
  keys: SearchKeys;
  mode?: 'quick' | 'deep';
}

function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function filterChineseResults(results: SearchResult[]): SearchResult[] {
  const chineseResults = results.filter(r => 
    containsChinese(r.title) || containsChinese(r.snippet)
  );
  
  if (chineseResults.length >= 5) {
    return chineseResults;
  }
  
  return [
    ...chineseResults,
    ...results.filter(r => !containsChinese(r.title) && !containsChinese(r.snippet))
  ];
}

export async function searchCompetitors(
  query: string,
  config: SearchConfig
): Promise<SearchResult[]> {
  const { providers, keys, mode = 'deep' } = config;

  const tavilyCount = mode === 'quick' ? 5 : 30;
  const bochaCount = mode === 'quick' ? 5 : 20;
  const youCount = mode === 'quick' ? 5 : 20;

  if (!providers || providers.length === 0) {
    return [];
  }

  const localizedQuery = containsChinese(query) ? query : `${query} 中国市场`;

  const searchPromises = providers.map(async (provider) => {
    try {
      if (provider === 'bocha' && keys.bocha) {
        return await searchBocha(localizedQuery, keys.bocha, bochaCount);
      } else if (provider === 'you' && keys.you) {
        return await searchYou(localizedQuery, keys.you, youCount);
      } else if (provider === 'tavily' && keys.tavily) {
        return await searchTavily(localizedQuery, keys.tavily, tavilyCount);
      }
      return [];
    } catch (error) {
      console.error(`[Search] Error with provider ${provider}:`, error);
      return [];
    }
  });

  const results = await Promise.all(searchPromises);
  const flatResults = results.flat();
  
  return filterChineseResults(flatResults);
}

async function searchTavily(query: string, apiKey: string, count: number): Promise<SearchResult[]> {
  const chineseDomains = [
    "zhihu.com", "36kr.com", "huxiu.com", "jianshu.com", "douban.com",
    "weibo.com", "baidu.com", "sohu.com", "163.com", "qq.com",
    "sina.com.cn", "bilibili.com", "xiaohongshu.com", "toutiao.com",
    "sspai.com", "geekpark.net", "pingwest.com", "qdaily.com", "jiqizhixin.com"
  ];

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: query,
      search_depth: "basic",
      include_answer: false,
      include_images: false,
      max_results: count,
      include_domains: chineseDomains
    })
  });

  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status}`);
  }

  const data = await response.json();
  return (data.results || []).map((item: any) => ({
    title: item.title,
    url: item.url,
    snippet: item.content || "",
    source: "Tavily"
  }));
}

async function searchBocha(query: string, apiKey: string, count: number): Promise<SearchResult[]> {
  const response = await fetch("https://api.bochaai.com/v1/web-search", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: query,
      freshness: "noLimit",
      summary: true,
      count: count,
      market: "zh-CN",
      language: "zh"
    })
  });

  if (!response.ok) {
    throw new Error(`Bocha API error: ${response.status}`);
  }

  const data = await response.json();
  return (data.data?.webPages?.value || []).map((item: any) => ({
    title: item.name || item.title,
    url: item.url,
    snippet: item.snippet || item.description || "",
    source: "Bocha"
  }));
}

async function searchYou(query: string, apiKey: string, count: number): Promise<SearchResult[]> {
  const response = await fetch(`https://ydc-index.io/v1/search?query=${encodeURIComponent(query)}&count=${count}&country=CN`, {
    headers: { "X-API-Key": apiKey }
  });

  if (!response.ok) {
    throw new Error(`You.com API error: ${response.status}`);
  }

  const data = await response.json();
  return (data.results?.web || []).map((item: any) => ({
    title: item.title || "",
    url: item.url || "",
    snippet: item.description || item.snippets?.[0] || "",
    source: "You.com"
  }));
}
