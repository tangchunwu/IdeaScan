import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
       "Access-Control-Allow-Origin": "*",
       "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Persona {
       id: string;
       name: string;
       role: string;
       system_prompt: string;
}

interface ValidationData {
       idea: string;
       tags: string[];
       overall_score: number;
       report?: {
              market_analysis?: any;
              ai_analysis?: any;
              sentiment_analysis?: any;
       };
}

async function generatePersonaComment(
       persona: Persona,
       validationData: ValidationData,
       apiKey: string,
       baseUrl: string,
       model: string
): Promise<string> {
       const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

       const contextPrompt = `
你正在评估一个创业想法：
- 创意: "${validationData.idea}"
- 标签: ${validationData.tags.join(", ")}
- 总分: ${validationData.overall_score}/100
${validationData.report?.market_analysis ? `- 市场分析: ${JSON.stringify(validationData.report.market_analysis).slice(0, 500)}` : ""}
${validationData.report?.ai_analysis ? `- AI评估: ${JSON.stringify(validationData.report.ai_analysis).slice(0, 500)}` : ""}

请用你的角色人设，对这个创意发表一条评论。
注意：直接输出评论内容，不要任何前缀或解释。
`;

       const response = await fetch(endpoint, {
              method: "POST",
              headers: {
                     "Authorization": `Bearer ${apiKey}`,
                     "Content-Type": "application/json",
              },
              body: JSON.stringify({
                     model: model,
                     messages: [
                            { role: "system", content: persona.system_prompt },
                            { role: "user", content: contextPrompt }
                     ],
                     temperature: 0.8,
                     max_tokens: 200,
              }),
       });

       if (!response.ok) {
              console.error(`Persona ${persona.name} generation failed:`, await response.text());
              return `[${persona.name}]: 我需要更多信息才能评价这个想法。`;
       }

       const data = await response.json();
       return data.choices[0]?.message?.content?.trim() || `[${persona.name}]: 暂无评论。`;
}

serve(async (req) => {
       if (req.method === "OPTIONS") {
              return new Response("ok", { headers: corsHeaders });
       }

       try {
              const { validation_id, config } = await req.json();

              if (!validation_id) {
                     throw new Error("validation_id is required");
              }

              const supabase = createClient(
                     Deno.env.get("SUPABASE_URL") ?? "",
                     Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
              );

              // 1. Get validation data
              const { data: validation, error: vError } = await supabase
                     .from("validations")
                     .select("*")
                     .eq("id", validation_id)
                     .single();

              if (vError || !validation) {
                     throw new Error("Validation not found");
              }

              // 2. Get report data
              const { data: report } = await supabase
                     .from("validation_reports")
                     .select("*")
                     .eq("validation_id", validation_id)
                     .single();

              // 3. Get active personas
              const { data: personas, error: pError } = await supabase
                     .from("personas")
                     .select("*")
                     .eq("is_active", true);

              if (pError || !personas || personas.length === 0) {
                     throw new Error("No personas configured");
              }

              // 4. Prepare validation data for prompts
              const validationData: ValidationData = {
                     idea: validation.idea,
                     tags: validation.tags || [],
                     overall_score: validation.overall_score || 50,
                     report: report || undefined,
              };

              // 5. Generate comments in parallel
              const apiKey = config?.llmApiKey || Deno.env.get("LOVABLE_API_KEY") || "";
              const baseUrl = config?.llmBaseUrl || "https://ai.gateway.lovable.dev/v1";
              const model = config?.llmModel || "google/gemini-3-flash-preview";

              console.log(`Generating comments for ${personas.length} personas...`);

              const commentPromises = personas.map(async (persona: Persona) => {
                     const content = await generatePersonaComment(persona, validationData, apiKey, baseUrl, model);

                     // Insert comment into DB
                     const { data: comment, error: insertError } = await supabase
                            .from("comments")
                            .insert({
                                   validation_id: validation_id,
                                   persona_id: persona.id,
                                   content: content,
                                   is_ai: true,
                            })
                            .select()
                            .single();

                     if (insertError) {
                            console.error(`Failed to insert comment for ${persona.name}:`, insertError);
                            return null;
                     }

                     return { ...comment, persona };
              });

              const comments = (await Promise.all(commentPromises)).filter(Boolean);

              console.log(`Generated ${comments.length} comments`);

              return new Response(
                     JSON.stringify({
                            success: true,
                            comments: comments,
                     }),
                     { headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
       } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : "Internal server error";
              console.error("Error in generate-discussion:", error);
              return new Response(
                     JSON.stringify({ error: errorMessage }),
                     { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
       }
});
