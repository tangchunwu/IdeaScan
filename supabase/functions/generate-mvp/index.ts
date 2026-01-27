
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

                // 2. Generate MVP Content (Mocked LLM for now, can be replaced with real API)
                // In a real scenario, we would send report.ai_analysis to OpenAI/Deepseek
                const idea = validation?.idea || 'Your Product';

                // Extract pain points from report or use defaults
                const reportData = report.ai_analysis as any;
                const painPoints = reportData?.painPoints || [
                        "Process is too slow",
                        "Solutions are too expensive",
                        "Lack of quality support"
                ];

                const generatedContent = {
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
                        painPoints: painPoints.map((p: string) => ({
                                problem: p,
                                solution: "We solve this by..."
                        })),
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

                // 3. Save to mvp_landing_pages
                // Check if exists first
                const { data: existingPage } = await supabaseClient
                        .from('mvp_landing_pages')
                        .select('id, slug')
                        .eq('validation_id', validationId)
                        .single();

                let result;
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
                                        user_id: (await supabaseClient.auth.getUser()).data.user?.id,
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

                return new Response(
                        JSON.stringify(result),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
        } catch (error) {
                return new Response(
                        JSON.stringify({ error: error.message }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
                )
        }
})
