import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  validateString, 
  validateSearchProvider,
  validateConfigType,
  ValidationError,
  LIMITS
} from "../_shared/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Validate URL format (without domain restriction for verify-config)
 * This is less restrictive since verify-config is just a test call
 */
function validateUrlFormat(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  
  const str = validateString(value, fieldName, LIMITS.URL_MAX_LENGTH);
  if (!str) return null;
  
  try {
    const parsed = new URL(str);
    // Only allow https for security
    if (parsed.protocol !== "https:") {
      throw new ValidationError(`${fieldName} must use HTTPS`);
    }
    return str;
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw new ValidationError(`${fieldName} must be a valid URL`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // Validate inputs
    const type = validateConfigType(body.type);
    const apiKey = validateString(body.apiKey, "apiKey", LIMITS.API_KEY_MAX_LENGTH, true)!;
    const provider = body.provider ? validateSearchProvider(body.provider) : null;
    const model = validateString(body.model, "model", LIMITS.MODEL_MAX_LENGTH) || undefined;
    
    // For LLM/image_gen, validate URL format (but allow any HTTPS domain)
    let baseUrl: string | undefined;
    if (type === 'llm' || type === 'image_gen') {
      baseUrl = validateUrlFormat(body.baseUrl, "baseUrl") || undefined;
    }

    let isValid = false;
    let message = "Configuration verification failed";

    if (type === 'llm') {
      try {
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
          message = "LLM connection successful";
        } else {
          isValid = false;
          message = "LLM connection failed. Please check your API key.";
        }
      } catch (e) {
        isValid = false;
        message = "Connection failed. Please check your network and try again.";
      }
    } else if (type === 'image_gen') {
      try {
        let cleanBaseUrl = (baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
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
          message = "Image generation API connection successful";
        } else {
          isValid = false;
          message = "Image generation API connection failed. Please check your API key.";
        }
      } catch (e) {
        isValid = false;
        message = "Connection failed. Please check your network and try again.";
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
          message = res.ok ? "Bocha API key is valid" : "Invalid Bocha API key";
        } catch (e) { 
          isValid = false; 
          message = "Connection failed. Please check your network."; 
        }
      } else if (provider === 'you') {
        try {
          const res = await fetch(`https://ydc-index.io/v1/search?query=test&count=1`, {
            headers: { "X-API-Key": apiKey }
          });
          isValid = res.ok;
          message = res.ok ? "You.com API key is valid" : "Invalid You.com API key";
        } catch (e) { 
          isValid = false; 
          message = "Connection failed. Please check your network."; 
        }
      } else if (provider === 'tavily') {
        try {
          const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: apiKey, query: "test", max_results: 1 })
          });
          isValid = res.ok;
          message = res.ok ? "Tavily API key is valid" : "Invalid Tavily API key";
        } catch (e) { 
          isValid = false; 
          message = "Connection failed. Please check your network."; 
        }
      } else {
        message = "Search provider is required";
      }
    }

    return new Response(
      JSON.stringify({ valid: isValid, message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    // Log detailed error server-side
    console.error("verify-config error:", error);
    
    // Return generic message for unexpected errors, specific for validation errors
    const message = error instanceof ValidationError 
      ? error.message 
      : "Configuration verification failed. Please try again.";
    
    return new Response(
      JSON.stringify({ valid: false, message }),
      { status: error instanceof ValidationError ? 400 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
