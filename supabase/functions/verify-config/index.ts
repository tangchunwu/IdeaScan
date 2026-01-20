import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
       "Access-Control-Allow-Origin": "*",
       "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
       if (req.method === "OPTIONS") {
              return new Response("ok", { headers: corsHeaders });
       }

       try {
              const { provider, apiKey, type, baseUrl, model } = await req.json();

              if (!apiKey) {
                     return new Response(
                            JSON.stringify({ valid: false, message: "API Key is missing" }),
                            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                     );
              }

              let isValid = false;
              let message = "Unknown provider";

              if (type === 'llm') {
                     try {
                            // Normalize base URL
                            let cleanBaseUrl = (baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
                            if (cleanBaseUrl.endsWith("/chat/completions")) {
                                   cleanBaseUrl = cleanBaseUrl.replace(/\/chat\/completions$/, "");
                            }
                            const endpoint = `${cleanBaseUrl}/chat/completions`;

                            const res = await fetch(endpoint, {
                                   method: "POST",
                                   headers: {
                                          "Authorization": `Bearer ${apiKey}`,
                                          "Content-Type": "application/json"
                                   },
                                   body: JSON.stringify({
                                          model: model || "gpt-3.5-turbo",
                                          messages: [{ role: "user", content: "Hello" }],
                                          max_tokens: 5
                                   })
                            });

                            if (res.ok) {
                                   isValid = true;
                                   message = "LLM Connection Successful";
                            } else {
                                   const errText = await res.text();
                                   isValid = false;
                                   message = `LLM Connection Failed: ${res.status} - ${errText.slice(0, 100)}`;
                            }
                     } catch (e) {
                            isValid = false;
                            message = `Connection Error: ${e instanceof Error ? e.message : 'Unknown error'}`;
                     }
              } else if (type === 'image_gen') {
                     try {
                            let cleanBaseUrl = (baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
                            // Use /models to verify key without generating image (cost saving)
                            const endpoint = `${cleanBaseUrl}/models`;

                            const res = await fetch(endpoint, {
                                   method: "GET",
                                   headers: {
                                          "Authorization": `Bearer ${apiKey}`,
                                          "Content-Type": "application/json"
                                   }
                            });

                            if (res.ok) {
                                   isValid = true;
                                   message = "Image Gen API Connection Successful";
                            } else {
                                   // Fallback: If modules not allowed, maybe try generation? No, too risky/costly.
                                   // Just return error.
                                   const errText = await res.text();
                                   isValid = false;
                                   message = `Image Gen Connection Failed: ${res.status} - ${errText.slice(0, 100)}`;
                            }
                     } catch (e) {
                            isValid = false;
                            message = `Connection Error: ${e instanceof Error ? e.message : 'Unknown error'}`;
                     }
              } else if (type === 'search') {
                     if (provider === 'bocha') {
                            try {
                                   const res = await fetch("https://api.bochaai.com/v1/web-search", {
                                          method: "POST",
                                          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                                          body: JSON.stringify({ query: "test", count: 1 })
                                   });
                                   isValid = res.ok;
                                   message = res.ok ? "Bocha Key is valid" : `Invalid Bocha Key (${res.status})`;
                            } catch (e) { isValid = false; message = "Connection failed"; }
                     } else if (provider === 'you') {
                            try {
                                   const res = await fetch(`https://ydc-index.io/v1/search?query=test&count=1`, {
                                          headers: { "X-API-Key": apiKey }
                                   });
                                   isValid = res.ok;
                                   message = res.ok ? "You.com Key is valid" : `Invalid You.com Key (${res.status})`;
                            } catch (e) { isValid = false; message = "Connection failed"; }
                     } else if (provider === 'tavily') {
                            try {
                                   const res = await fetch("https://api.tavily.com/search", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ api_key: apiKey, query: "test", max_results: 1 })
                                   });
                                   isValid = res.ok;
                                   message = res.ok ? "Tavily Key is valid" : `Invalid Tavily Key (${res.status})`;
                            } catch (e) { isValid = false; message = "Connection failed"; }
                     }
              }

              return new Response(
                     JSON.stringify({ valid: isValid, message }),
                     { headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
       } catch (error) {
              const message = error instanceof Error ? error.message : 'Unknown error';
              return new Response(
                     JSON.stringify({ valid: false, message }),
                     { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
       }
});
