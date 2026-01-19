export interface SearchResult {
       title: string;
       url: string;
       snippet: string;
       source: string;
}

export async function searchCompetitors(
       query: string,
       provider: 'bocha' | 'you' | 'none',
       apiKey: string
): Promise<SearchResult[]> {
       if (provider === 'none' || !apiKey) {
              return [];
       }

       try {
              if (provider === 'bocha') {
                     return await searchBocha(query, apiKey);
              } else if (provider === 'you') {
                     return await searchYou(query, apiKey);
              }
       } catch (error) {
              console.error(`[Search] Error with provider ${provider}:`, error);
              return [];
       }

       return [];
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
       // Adapt based on Bocha's actual response format
       // Assuming data.data.webPages.value[] or similar.
       // Note: Adjust mapping based on actual Bocha response structure.
       // Common format: { daat: { webpage: [...] } }

       // For Bocha (assuming standard format, need verification or fallback)
       // If specific Bocha format differs, log it to debug.

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
       const response = await fetch(`https://api.ydc-index.io/search?query=${encodeURIComponent(query)}&num_web_results=5`, {
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
