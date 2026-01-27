// Phase 7: Idea Discovery - Signal Processor
// This Edge Function processes unprocessed raw_market_signals using AI
// It computes: sentiment_score, opportunity_score, topic_tags, pain_level

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RawSignal {
        id: string;
        content: string;
        source: string;
        likes_count: number;
        comments_count: number;
}

interface AIAnalysisResult {
        sentiment_score: number; // -1 to 1
        opportunity_score: number; // 0-100
        topic_tags: string[];
        pain_level: string; // 'mild' | 'moderate' | 'severe' | 'critical'
}

async function analyzeSignalWithAI(
        signal: RawSignal,
        apiKey: string,
        baseUrl: string,
        model: string
): Promise<AIAnalysisResult> {
        const prompt = `你是一个专业的市场调研分析师。分析以下用户评论/帖子，判断其是否隐含一个**未被满足的需求**或**商业机会**。

用户内容:
"""
${signal.content.slice(0, 1500)}
"""

来源: ${signal.source}
互动量: ${signal.likes_count} 赞, ${signal.comments_count} 评论

请严格返回以下 JSON (不要返回其他内容):
{
  "sentiment_score": <-1到1的浮点数, -1表示极其负面/痛苦, 0表示中性, 1表示正面>,
  "opportunity_score": <0-100整数, 评估这是否是一个值得追踪的商业机会. 100分标准: 用户明确表达了强烈痛点+愿意为解决方案付费+市场大>,
  "topic_tags": ["标签1", "标签2", "标签3"], // 最多5个标签, 如: "saas", "效率工具", "付费意愿", "抱怨现有方案"
  "pain_level": "<'mild'|'moderate'|'severe'|'critical'> // 痛点程度"
}

评分参考:
- 90-100: 明确表达强烈痛点+愿意付费+大市场 (如: "求推荐一个好用的XX软件，愿意付费！")
- 70-89: 有明确痛点，但付费意愿不明 (如: "XX真的太难用了!")
- 40-69: 有轻微抱怨或需求，但很泛 (如: "有没有更好的方案?")
- 0-39: 无明显商业机会，纯吐槽或闲聊`;

        const endpoint = `${baseUrl}/chat/completions`;

        const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                },
                body: JSON.stringify({
                        model: model,
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.2,
                }),
        });

        if (!response.ok) {
                throw new Error(`AI request failed: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content || "";

        // Extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
                throw new Error("AI did not return valid JSON");
        }

        try {
                const result = JSON.parse(jsonMatch[0]);
                return {
                        sentiment_score: Math.max(-1, Math.min(1, result.sentiment_score || 0)),
                        opportunity_score: Math.max(0, Math.min(100, result.opportunity_score || 0)),
                        topic_tags: Array.isArray(result.topic_tags) ? result.topic_tags.slice(0, 5) : [],
                        pain_level: ["mild", "moderate", "severe", "critical"].includes(result.pain_level)
                                ? result.pain_level
                                : "mild"
                };
        } catch (e) {
                console.error("Failed to parse AI JSON:", content);
                throw new Error("Failed to parse AI response");
        }
}

serve(async (req) => {
        if (req.method === "OPTIONS") {
                return new Response("ok", { headers: corsHeaders });
        }

        try {
                const supabase = createClient(
                        Deno.env.get("SUPABASE_URL") ?? "",
                        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
                );

                // AI Configuration (reuse existing settings)
                const apiKey = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("DEEPSEEK_API_KEY");
                const baseUrl = Deno.env.get("LLM_BASE_URL") || "https://ai.gateway.lovable.dev/v1";
                const model = Deno.env.get("LLM_MODEL") || "deepseek/deepseek-chat";

                if (!apiKey) {
                        throw new Error("No AI API key configured");
                }

                // Parse request body for batch size
                let batchSize = 50;
                try {
                        const body = await req.json();
                        batchSize = body.batchSize || 50;
                } catch {
                        // Use default batch size
                }

                // 1. Fetch unprocessed signals
                const { data: signals, error: fetchError } = await supabase
                        .from("raw_market_signals")
                        .select("id, content, source, likes_count, comments_count")
                        .is("processed_at", null)
                        .order("scanned_at", { ascending: false })
                        .limit(batchSize);

                if (fetchError) {
                        throw new Error(`Failed to fetch signals: ${fetchError.message}`);
                }

                console.log(`[Processor] Found ${signals?.length || 0} unprocessed signals`);

                let successCount = 0;
                let failCount = 0;
                const highOpportunities: { id: string; score: number; content: string }[] = [];

                // 2. Process each signal with AI
                for (const signal of (signals as RawSignal[]) || []) {
                        try {
                                const analysis = await analyzeSignalWithAI(signal, apiKey, baseUrl, model);

                                // Update the signal with analysis results
                                const { error: updateError } = await supabase
                                        .from("raw_market_signals")
                                        .update({
                                                sentiment_score: analysis.sentiment_score,
                                                opportunity_score: analysis.opportunity_score,
                                                topic_tags: analysis.topic_tags,
                                                pain_level: analysis.pain_level,
                                                processed_at: new Date().toISOString()
                                        })
                                        .eq("id", signal.id);

                                if (updateError) {
                                        console.error(`Failed to update signal ${signal.id}:`, updateError);
                                        failCount++;
                                } else {
                                        successCount++;

                                        // Track high-opportunity signals for potential niche detection
                                        if (analysis.opportunity_score >= 70) {
                                                highOpportunities.push({
                                                        id: signal.id,
                                                        score: analysis.opportunity_score,
                                                        content: signal.content.slice(0, 200)
                                                });
                                        }
                                }

                                // Rate limiting - avoid hitting API limits
                                await new Promise(resolve => setTimeout(resolve, 100));

                        } catch (e) {
                                console.error(`[Processor] Error analyzing signal ${signal.id}:`, e);
                                failCount++;
                        }
                }

                console.log(`[Processor] Complete: ${successCount} success, ${failCount} failed, ${highOpportunities.length} high-opportunity`);

                return new Response(
                        JSON.stringify({
                                success: true,
                                processed: successCount,
                                failed: failCount,
                                high_opportunities: highOpportunities.length,
                                sample_opportunities: highOpportunities.slice(0, 5)
                        }),
                        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );

        } catch (error) {
                console.error("[Processor] Fatal error:", error);
                return new Response(
                        JSON.stringify({ error: error.message }),
                        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
                );
        }
});
