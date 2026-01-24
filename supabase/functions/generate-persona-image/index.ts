import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PersonaImageRequest {
  personaDescription: string;
  personaName: string;
  personaRole: string;
  age?: string;
  // 用户配置的图片生成API
  imageGenBaseUrl?: string;
  imageGenApiKey?: string;
  imageGenModel?: string;
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

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: PersonaImageRequest = await req.json();
    const { 
      personaDescription, 
      personaName, 
      personaRole, 
      age,
      imageGenBaseUrl,
      imageGenApiKey,
      imageGenModel 
    } = body;

    if (!personaDescription || !personaName) {
      return new Response(
        JSON.stringify({ error: "Persona description and name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 检查是否有用户配置的图片生成API
    const baseUrl = imageGenBaseUrl || "https://api.openai.com/v1";
    const apiKey = imageGenApiKey || Deno.env.get("LOVABLE_API_KEY");
    const model = imageGenModel || "dall-e-3";

    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          error: "No image generation API configured",
          needsConfig: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 构建图片生成提示词 - 中国风格人物头像
    const prompt = `Portrait of a Chinese professional: ${personaRole}. ${age ? `Age around ${age}.` : ''} 
Style: Clean, modern illustration style, minimalist background, warm and approachable expression.
The person should look professional yet friendly, suitable for a business avatar.
${personaDescription}
High quality, digital art, centered composition, soft lighting.`;

    console.log("Generating image with prompt:", prompt.substring(0, 100) + "...");

    // 调用图片生成API (OpenAI compatible)
    const imageResponse = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        n: 1,
        size: "256x256",
        response_format: "url"
      })
    });

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error("Image generation API error:", errorText);
      return new Response(
        JSON.stringify({ 
          error: "Image generation failed",
          details: errorText 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const imageData = await imageResponse.json();
    const imageUrl = imageData.data?.[0]?.url;

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "No image URL returned" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Image generated successfully");

    return new Response(
      JSON.stringify({ 
        success: true,
        imageUrl: imageUrl,
        personaName: personaName
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error generating persona image:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
