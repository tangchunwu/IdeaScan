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

    // 检查是否有用户配置的图片生成API，或使用 Lovable API Key
    const userApiKey = imageGenApiKey;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    // 决定使用哪个 API
    const useUserConfig = userApiKey && imageGenBaseUrl;
    const apiKey = useUserConfig ? userApiKey : lovableApiKey;
    
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
    const prompt = `生成一个中国职场人物头像：${personaRole}。${age ? `年龄约${age}岁。` : ''} 
风格：简洁现代的插画风格，极简背景，温暖亲切的表情。
人物应该看起来专业又友好，适合作为商务头像。
${personaDescription}
高质量数字艺术，居中构图，柔和光线，正方形头像。`;

    console.log("Generating image for persona:", personaName);
    console.log("Using Lovable AI:", !useUserConfig);

    let imageUrl: string | null = null;

    if (useUserConfig) {
      // 用户自定义的图片生成 API (OpenAI compatible)
      const baseUrl = imageGenBaseUrl!.replace(/\/$/, "");
      const model = imageGenModel || "dall-e-3";
      
      console.log("Using custom image API:", baseUrl);
      
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
        console.error("Custom image API error:", errorText);
        return new Response(
          JSON.stringify({ 
            error: "Image generation failed",
            details: errorText 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const imageData = await imageResponse.json();
      imageUrl = imageData.data?.[0]?.url;
    } else {
      // 使用 Lovable AI Gateway 的图片生成
      console.log("Using Lovable AI for image generation");
      
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image-preview",
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          modalities: ["image", "text"]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Lovable AI image error:", response.status, errorText);
        
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: "API credits exhausted, please add funds" }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({ 
            error: "Image generation failed",
            details: errorText 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      console.log("Lovable AI response received");
      
      // 从 Lovable AI 响应中提取图片
      const images = data.choices?.[0]?.message?.images;
      if (images && images.length > 0) {
        imageUrl = images[0]?.image_url?.url;
        console.log("Got base64 image from Lovable AI");
      }
    }

    if (!imageUrl) {
      console.error("No image URL returned from API");
      return new Response(
        JSON.stringify({ error: "No image generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Image generated successfully for:", personaName);

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
