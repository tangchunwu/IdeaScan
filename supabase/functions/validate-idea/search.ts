export interface SearchResult {
       title: string;
       url: string;
       snippet: string;
       source: string;
}

// Search provider keys interface
export interface SearchKeys {
       bocha?: string;
       you?: string;
       tavily?: string;
}

// Search Config Interface
export interface SearchConfig {
       providers: ('bocha' | 'you' | 'tavily')[];
       keys: SearchKeys;
       mode?: 'quick' | 'deep';
}

// 检测文本是否包含中文字符
function containsChinese(text: string): boolean {
       return /[\u4e00-\u9fff]/.test(text);
}

// 过滤结果，优先保留中文内容
function filterChineseResults(results: SearchResult[]): SearchResult[] {
       // 首先筛选包含中文的结果
       const chineseResults = results.filter(r => 
              containsChinese(r.title) || containsChinese(r.snippet)
       );
       
       // 如果中文结果足够多，只返回中文结果
       if (chineseResults.length >= 5) {
              return chineseResults;
       }
       
       // 否则返回所有结果但中文优先
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

       // Determine count based on mode
       const tavilyCount = mode === 'quick' ? 5 : 30;
       const bochaCount = mode === 'quick' ? 5 : 20;
       const youCount = mode === 'quick' ? 5 : 20;

       if (!providers || providers.length === 0) {
              return [];
       }

       // 确保查询包含中文上下文
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
       
       // 过滤并优先返回中文结果
       return filterChineseResults(flatResults);
}

async function searchTavily(query: string, apiKey: string, count: number): Promise<SearchResult[]> {
       // 中国主流内容网站域名
       const chineseDomains = [
              "zhihu.com",
              "36kr.com",
              "huxiu.com",
              "jianshu.com",
              "douban.com",
              "weibo.com",
              "baidu.com",
              "sohu.com",
              "163.com",
              "qq.com",
              "sina.com.cn",
              "bilibili.com",
              "xiaohongshu.com",
              "toutiao.com",
              "sspai.com",
              "geekpark.net",
              "pingwest.com",
              "qdaily.com",
              "jiqizhixin.com"
       ];

       const response = await fetch("https://api.tavily.com/search", {
              method: "POST",
              headers: {
                     "Content-Type": "application/json"
              },
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
              const errorText = await response.text();
              throw new Error(`Tavily API error: ${response.status} - ${errorText}`);
       }

       const data = await response.json();
       const results = data.results || [];

       return results.map((item: any) => ({
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
                     // Bocha 支持的本地化参数
                     market: "zh-CN",
                     language: "zh"
              })
       });

       if (!response.ok) {
              throw new Error(`Bocha API error: ${response.status}`);
       }

       const data = await response.json();
       const results = data.data?.webPages?.value || [];

       return results.map((item: any) => ({
              title: item.name || item.title,
              url: item.url,
              snippet: item.snippet || item.description || "",
              source: "Bocha"
       }));
}

async function searchYou(query: string, apiKey: string, count: number): Promise<SearchResult[]> {
       // You.com YDC Index API - 添加国家参数
       const response = await fetch(`https://ydc-index.io/v1/search?query=${encodeURIComponent(query)}&count=${count}&country=CN`, {
              headers: {
                     "X-API-Key": apiKey
              }
       });

       if (!response.ok) {
              throw new Error(`You.com API error: ${response.status}`);
       }

       const data = await response.json();

       // YDC API returns results.web array
       const webResults = data.results?.web || [];

       return webResults.map((item: any) => ({
              title: item.title || "",
              url: item.url || "",
              snippet: item.description || item.snippets?.[0] || "",
              source: "You.com"
       }));
}
