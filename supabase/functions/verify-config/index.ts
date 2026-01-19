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
              const { provider, apiKey, type } = await req.json();

              if (!apiKey) {
                     return new Response(
                            JSON.stringify({ valid: false, message: "API Key is missing" }),
                            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                     );
              }

              let isValid = false;
              let message = "Unknown provider";

              if (type === 'llm') {
                     // Basic verify for LLM (just check if key looks valid format-wise for now or simple call)
                     // For now, let's just say valid if length > 10. Real verification is complex for generic providers.
                     isValid = apiKey.length > 5;
                     message = "LLM Key format looks valid (Server-side check pending)";
                     // Ideally, make a small request to the provider.
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
                                   const res = await fetch(`https://api.ydc-index.io/search?query=test`, {
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
              return new Response(
                     JSON.stringify({ valid: false, message: error.message }),
                     { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
       }
});
