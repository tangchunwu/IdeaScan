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
}

export async function searchCompetitors(
       query: string,
       config: SearchConfig
): Promise<SearchResult[]> {
       const { providers, keys } = config;

       if (!providers || providers.length === 0) {
              return [];
       }

       const searchPromises = providers.map(async (provider) => {
              try {
                     if (provider === 'bocha' && keys.bocha) {
                            return await searchBocha(query, keys.bocha);
                     } else if (provider === 'you' && keys.you) {
                            return await searchYou(query, keys.you);
                     } else if (provider === 'tavily' && keys.tavily) {
                            return await searchTavily(query, keys.tavily);
                     }
                     return [];
              } catch (error) {
                     console.error(`[Search] Error with provider ${provider}:`, error);
                     return [];
              }
       });

       const results = await Promise.all(searchPromises);
       // Flatten and dedup results if needed, simple flatten for now
       return results.flat();
}

async function searchTavily(query: string, apiKey: string): Promise<SearchResult[]> {
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
                     max_results: 5
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

async function searchBocha(query: string, apiKey: string): Promise<SearchResult[]> {
       const response = await fetch("https://api.bochaai.com/v1/web-search", {
              method: "POST",
              headers: {
                     "Authorization": `Bearer ${apiKey}`,
                     "Content-Type": "application/json"
              },
              body: JSON.stringify({
                     query: query,
                     freshness: "noLimit", // or "oneMonth"
                     summary: true,
                     count: 5
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

async function searchYou(query: string, apiKey: string): Promise<SearchResult[]> {
       // You.com usually uses YDC (You.com Developer Control) API
       const response = await fetch(`https://ydc-index.io/v1/search?query=${encodeURIComponent(query)}&count=5`, {
              headers: {
                     "X-API-Key": apiKey
              }
       });

       if (!response.ok) {
              throw new Error(`You.com API error: ${response.status}`);
       }

       const data = await response.json();

       // Mapping YDC response
       const hits = data.hits || [];

       return hits.map((hit: any) => ({
              title: hit.title,
              url: hit.url,
              snippet: hit.description || hit.snippets?.join(" ") || "",
              source: "You.com"
       }));
}
