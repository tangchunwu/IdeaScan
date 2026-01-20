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

interface Comment {
       id: string;
       content: string;
       persona_id: string | null;
       user_id: string | null;
       is_ai: boolean;
}

serve(async (req) => {
       if (req.method === "OPTIONS") {
              return new Response("ok", { headers: corsHeaders });
       }

       try {
              const { comment_id, user_reply, config } = await req.json();

              if (!comment_id || !user_reply) {
                     throw new Error("comment_id and user_reply are required");
              }

              const supabase = createClient(
                     Deno.env.get("SUPABASE_URL") ?? "",
                     Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
              );

              // Get auth user
              const authHeader = req.headers.get("Authorization");
              if (!authHeader) throw new Error("Authorization required");

              const token = authHeader.replace("Bearer ", "");
              const { data: { user }, error: userError } = await supabase.auth.getUser(token);
              if (userError || !user) throw new Error("Invalid user token");

              // 1. Get the original AI comment
              const { data: originalComment, error: cError } = await supabase
                     .from("comments")
                     .select("*, persona:personas(*)")
                     .eq("id", comment_id)
                     .single();

              if (cError || !originalComment) {
                     throw new Error("Comment not found");
              }

              if (!originalComment.is_ai || !originalComment.persona) {
                     throw new Error("Can only reply to AI comments");
              }

              const persona: Persona = originalComment.persona;

              // 2. Save user's reply first
              const { data: userComment, error: insertUserError } = await supabase
                     .from("comments")
                     .insert({
                            validation_id: originalComment.validation_id,
                            user_id: user.id,
                            content: user_reply,
                            parent_id: comment_id,
                            is_ai: false,
                     })
                     .select()
                     .single();

              if (insertUserError) {
                     throw new Error("Failed to save user reply");
              }

              // 3. Get validation context
              const { data: validation } = await supabase
                     .from("validations")
                     .select("*")
                     .eq("id", originalComment.validation_id)
                     .single();

              // 4. Build conversation history
              const { data: conversationHistory } = await supabase
                     .from("comments")
                     .select("content, is_ai, persona:personas(name)")
                     .eq("validation_id", originalComment.validation_id)
                     .or(`id.eq.${comment_id},parent_id.eq.${comment_id}`)
                     .order("created_at", { ascending: true });

              const historyText = (conversationHistory || [])
                     .map((c: any) => `${c.is_ai ? c.persona?.name || 'AI' : '用户'}: ${c.content}`)
                     .join("\n");

              // 5. Generate AI reply
              const apiKey = config?.llmApiKey || Deno.env.get("LOVABLE_API_KEY") || "";
              const baseUrl = (config?.llmBaseUrl || "https://ai.gateway.lovable.dev/v1").replace(/\/$/, "");
              const model = config?.llmModel || "google/gemini-3-flash-preview";

              const prompt = `你正在讨论一个创业想法: "${validation?.idea || '未知'}"

对话历史:
${historyText}

用户刚刚回复了你: "${user_reply}"

请用你的角色人设继续对话。根据用户的回复：
- 如果用户提出了好的观点，可以适当认可
- 如果用户的回复不够有力，继续追问或质疑
- 保持你的角色性格

直接输出回复内容，不要任何前缀。控制在100字以内。`;

              const response = await fetch(`${baseUrl}/chat/completions`, {
                     method: "POST",
                     headers: {
                            "Authorization": `Bearer ${apiKey}`,
                            "Content-Type": "application/json",
                     },
                     body: JSON.stringify({
                            model: model,
                            messages: [
                                   { role: "system", content: persona.system_prompt },
                                   { role: "user", content: prompt }
                            ],
                            temperature: 0.8,
                            max_tokens: 150,
                     }),
              });

              if (!response.ok) {
                     console.error("AI reply failed:", await response.text());
                     throw new Error("Failed to generate AI reply");
              }

              const data = await response.json();
              const aiReplyContent = data.choices[0]?.message?.content?.trim() || "让我再想想...";

              // 6. Save AI reply
              const { data: aiReply, error: insertAiError } = await supabase
                     .from("comments")
                     .insert({
                            validation_id: originalComment.validation_id,
                            persona_id: persona.id,
                            content: aiReplyContent,
                            parent_id: userComment.id,
                            is_ai: true,
                     })
                     .select("*, persona:personas(*)")
                     .single();

              if (insertAiError) {
                     throw new Error("Failed to save AI reply");
              }

              return new Response(
                     JSON.stringify({
                            success: true,
                            userComment: userComment,
                            aiReply: aiReply,
                     }),
                     { headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
       } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : "Internal server error";
              console.error("Error in reply-to-comment:", error);
              return new Response(
                     JSON.stringify({ error: errorMessage }),
                     { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
       }
});
