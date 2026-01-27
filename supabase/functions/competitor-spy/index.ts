
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PricingAnalysis {
        freemium_available: boolean;
        starting_price: string;
        pricing_model: string;
        target_customer: string;
        key_differentiator: string;
}

serve(async (req) => {
        if (req.method === 'OPTIONS') {
                return new Response('ok', { headers: corsHeaders })
        }

        try {
                const { competitorName, competitorUrl } = await req.json();

                if (!competitorName) {
                        throw new Error("Missing competitorName");
                }

                // 1. API Configuration
                const tavilyKey = Deno.env.get("TAVILY_API_KEY");
                const aiKey = Deno.env.get("DEEPSEEK_API_KEY") || Deno.env.get("LOVABLE_API_KEY");
                const aiUrl = Deno.env.get("LLM_BASE_URL") || "https://ai.gateway.lovable.dev/v1";
                const aiModel = Deno.env.get("LLM_MODEL") || "deepseek/deepseek-chat";

                if (!tavilyKey || !aiKey) {
                        throw new Error("Missing API Keys (TAVILY_API_KEY or DEEPSEEK_API_KEY)");
                }

                // 2. Search for Pricing Info (Tavily)
                console.log(`Searching for ${competitorName} pricing...`);
                const searchResponse = await fetch("https://api.tavily.com/search", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                                api_key: tavilyKey,
                                query: `${competitorName} pricing model cost free tier limits`,
                                search_depth: "basic",
                                include_answer: true,
                                max_results: 3
                        })
                });

                const searchData = await searchResponse.json();
                const snippets = searchData.results?.map((r: any) => r.content).join("\n---\n") || "";
                const answer = searchData.answer || "";

                // 3. Analyze with AI
                console.log("Analyzing with AI...");
                const systemPrompt = `You are a Competitive Intelligence Analyst. 
Analyze the provided search results about a competitor's pricing.
Output STRICT JSON only.`;

                const userPrompt = `
Competitor: ${competitorName} (${competitorUrl})

Search Results:
${answer}
${snippets}

Task: Infer the pricing strategy.

Required JSON Format:
{
  "freemium_available": boolean,
  "starting_price": "e.g. $10/mo or Free",
  "pricing_model": "e.g. Per User, Usage Based, Flat Rate",
  "target_customer": "e.g. Enterprise, SMB, Freelancers",
  "key_differentiator": "One short sentence on their pricing advantage"
}
`;

                const aiResponse = await fetch(`${aiUrl}/chat/completions`, {
                        method: "POST",
                        headers: {
                                "Authorization": `Bearer ${aiKey}`,
                                "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                                model: aiModel,
                                messages: [
                                        { role: "system", content: systemPrompt },
                                        { role: "user", content: userPrompt }
                                ],
                                temperature: 0.5,
                                response_format: { type: "json_object" }
                        })
                });

                const aiData = await aiResponse.json();
                const content = aiData.choices[0]?.message?.content || "{}";

                console.log("AI Output:", content);

                // Parse JSON safely
                let analysis: PricingAnalysis;
                try {
                        analysis = JSON.parse(content);
                } catch (e) {
                        // Fallback regex extraction if JSON is messy
                        analysis = {
                                freemium_available: content.toLowerCase().includes("true"),
                                starting_price: "Unknown",
                                pricing_model: "Unknown",
                                target_customer: "Unknown",
                                key_differentiator: "Analysis failed to parse"
                        };
                }

                return new Response(
                        JSON.stringify(analysis),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )

	} catch (error) {
		console.error("Error:", error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return new Response(
			JSON.stringify({ error: message }),
			{ headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
		)
        }
})
