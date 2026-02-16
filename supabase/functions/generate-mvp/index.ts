
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MvpContent {
        hero: {
                title: string;
                subtitle: string;
                cta: string;
        };
        features: {
                title: string;
                description: string;
                icon: string;
        }[];
        painPoints: {
                problem: string;
                solution: string;
        }[];
        testimonials: {
                name: string;
                role: string;
                quote: string;
        }[];
        faq: {
                question: string;
                answer: string;
        }[];
}

async function generateWithAI(
        idea: string,
        reportData: any,
        apiKey: string,
        baseUrl: string,
        model: string
): Promise<MvpContent> {
        const painPoints = reportData.painPoints || [];
        const targetAudience = reportData.persona?.name || "Target User";
        const marketContext = JSON.stringify(reportData.market_analysis || {});

        const systemPrompt = `You are a world-class Growth Hacker and Landing Page Copywriter. 
Your goal is to write high-converting, emotional, and benefits-driven copy for a new product URL.
You must output STRICT JSON format only.`;

        const userPrompt = `
Product Idea: "${idea}"
Target Audience: ${targetAudience}
Pain Points: ${JSON.stringify(painPoints)}
Market Context: ${marketContext}

Write the content for a Landing Page that sells this solution.
The tone should be professional yet empathetic and exciting.

Required JSON Structure:
{
  "hero": {
    "title": "Main Headline (H1) - Catchy, benefit-driven, under 10 words",
    "subtitle": "Subheadline (H2) - Explains what it is and who it's for, under 20 words",
    "cta": "Call to Action - e.g., 'Get Early Access'"
  },
  "features": [
    { "title": "Feature 1", "description": "Benefit 1", "icon": "Zap" },
    { "title": "Feature 2", "description": "Benefit 2", "icon": "Shield" },
    { "title": "Feature 3", "description": "Benefit 3", "icon": "Heart" }
  ],
  "painPoints": [
    { "problem": "Real user pain from context", "solution": "How we solve it" }
  ],
  "testimonials": [
    { "name": "Name", "role": "Role", "quote": "Short glowing review" }
  ],
  "faq": [
    { "question": "Q1", "answer": "A1" },
    { "question": "Q2", "answer": "A2" }
  ]
}

IMPORTANT:
1. Use "Zap", "Shield", "Heart", "Star", "BarChart", "Globe", "Users" as icons.
2. Return ONLY the JSON object. No markdown formatting.
`;

        console.log("Calling AI with model:", model);

        try {
                const response = await fetch(`${baseUrl}/chat/completions`, {
                        method: "POST",
                        headers: {
                                "Authorization": `Bearer ${apiKey}`,
                                "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                                model: model,
                                messages: [
                                        { role: "system", content: systemPrompt },
                                        { role: "user", content: userPrompt }
                                ],
                                temperature: 0.7,
                        }),
                });

                if (!response.ok) {
                        const errText = await response.text();
                        console.error("AI API Error:", errText);
                        throw new Error(`AI API failed: ${response.status} ${errText}`);
                }

                const data = await response.json();
                const content = data.choices[0]?.message?.content || "";

                // Parsing logic
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                        throw new Error("AI did not return valid JSON");
                }

                return JSON.parse(jsonMatch[0]);
        } catch (error) {
                console.error("AI Generation Failed:", error);
                throw error;
        }
}

// Fallback Mock Generator
function generateMockContent(idea: string): MvpContent {
        return {
                hero: {
                        title: `Stop struggling with ${idea}`,
                        subtitle: "The ultimate solution you've been waiting for. Validated by data, built for you.",
                        cta: "Join Waitlist",
                },
                features: [
                        {
                                title: "Smart Automation",
                                description: "Save hours every day with our intelligent workflow engine.",
                                icon: "Zap"
                        },
                        {
                                title: "Data Driven",
                                description: "Make decisions based on real-time analytics, not guesswork.",
                                icon: "BarChart"
                        },
                        {
                                title: "Secure & Reliable",
                                description: "Enterprise-grade security compliant with all major standards.",
                                icon: "Shield"
                        }
                ],
                painPoints: [
                        {
                                problem: "Process is too slow",
                                solution: "We automate manual tasks instantly."
                        }
                ],
                testimonials: [
                        {
                                name: "Early Adopter",
                                role: "Product Manager",
                                quote: "This is exactly what I needed. Typically I spend 3 days on this, now it takes 5 minutes."
                        }
                ],
                faq: [
                        {
                                question: "When will you launch?",
                                answer: "We are currently in private beta. Join the waitlist to get early access."
                        },
                        {
                                question: "Is it free?",
                                answer: "We have a free tier for early users."
                        }
                ]
        };
}

serve(async (req) => {
        if (req.method === 'OPTIONS') {
                return new Response('ok', { headers: corsHeaders })
        }

        try {
                const { validationId } = await req.json()
                const supabaseClient = createClient(
                        Deno.env.get('SUPABASE_URL') ?? '',
                        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
                        { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
                )

                // 1. Get validation report data
                const { data: report, error: reportError } = await supabaseClient
                        .from('validation_reports')
                        .select('*')
                        .eq('validation_id', validationId)
                        .single()

                if (reportError || !report) {
                        throw new Error('Validation report not found')
                }

                const { data: validation } = await supabaseClient
                        .from('validations')
                        .select('idea')
                        .eq('id', validationId)
                        .single()

                const idea = validation?.idea || 'Your Product';

                // AI Configuration
                const apiKey = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("DEEPSEEK_API_KEY") || Deno.env.get("OPENAI_API_KEY");
                const baseUrl = Deno.env.get("LLM_BASE_URL") || "https://ai.gateway.lovable.dev/v1";
                const model = Deno.env.get("LLM_MODEL") || "deepseek/deepseek-chat";

                let generatedContent: MvpContent;

                // 2. Generate MVP Content 
                if (apiKey) {
                        try {
                                console.log("Attempting AI generation...");
                                // enhance report data with existing analysis if available
                                const reportContext = {
                                        ...report,
                                        persona: typeof report.persona === 'string' ? JSON.parse(report.persona) : report.persona,
                                        market_analysis: typeof report.market_analysis === 'string' ? JSON.parse(report.market_analysis) : report.market_analysis,
                                        painPoints: (report.ai_analysis as any)?.painPoints
                                };

                                generatedContent = await generateWithAI(idea, reportContext, apiKey, baseUrl, model);
                        } catch (err) {
                                console.warn("AI generation failed, falling back to mock:", err);
                                generatedContent = generateMockContent(idea);
                        }
                } else {
                        console.log("No API key found, using mock data");
                        generatedContent = generateMockContent(idea);
                }

                // 3. Save to mvp_landing_pages
                const { data: existingPage } = await supabaseClient
                        .from('mvp_landing_pages')
                        .select('id, slug, user_id')
                        .eq('validation_id', validationId)
                        .single();

                let result;
                const authUser = (await supabaseClient.auth.getUser()).data.user;
                if (existingPage) {
                        // Update
                        const { data, error } = await supabaseClient
                                .from('mvp_landing_pages')
                                .update({ content: generatedContent })
                                .eq('id', existingPage.id)
                                .select()
                                .single();

                        if (error) throw error;
                        result = data;
                } else {
                        // Create new
                        const slug = `${idea.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.floor(Math.random() * 1000)}`;
                        const { data, error } = await supabaseClient
                                .from('mvp_landing_pages')
                                .insert({
                                        user_id: authUser?.id,
                                        validation_id: validationId,
                                        slug: slug,
                                        content: generatedContent,
                                        theme: 'modern'
                                })
                                .select()
                                .single();

                        if (error) throw error;
                        result = data;
                }

                // 4. Ensure demand experiment record exists for proof tracking
                const experimentUserId = existingPage?.user_id || authUser?.id;
                if (result?.id && experimentUserId) {
                        await supabaseClient
                                .from('demand_experiments')
                                .upsert({
                                        user_id: experimentUserId,
                                        validation_id: validationId,
                                        landing_page_id: result.id,
                                        idea,
                                        value_prop: generatedContent?.hero?.subtitle || idea,
                                        cta_label: generatedContent?.hero?.cta || 'Reserve Early Access',
                                        cta_type: 'paid_intent',
                                        status: 'running',
                                }, { onConflict: 'landing_page_id' });
                }

                return new Response(
                        JSON.stringify(result),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
	} catch (error) {
		console.error("Fatal Error:", error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return new Response(
			JSON.stringify({ error: message }),
			{ headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
		)
        }
})
