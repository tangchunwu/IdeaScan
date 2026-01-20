// Rate limiting utilities for edge functions
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Rate limit configurations per endpoint
 */
export const RATE_LIMITS = {
  "validate-idea": { maxRequests: 10, windowSeconds: 3600 }, // 10 per hour
  "verify-config": { maxRequests: 30, windowSeconds: 3600 },  // 30 per hour  
  "generate-discussion": { maxRequests: 50, windowSeconds: 3600 }, // 50 per hour
  "reply-to-comment": { maxRequests: 100, windowSeconds: 3600 }, // 100 per hour
  "list-validations": { maxRequests: 100, windowSeconds: 3600 }, // 100 per hour
  "get-validation": { maxRequests: 200, windowSeconds: 3600 }, // 200 per hour
  "delete-validation": { maxRequests: 50, windowSeconds: 3600 }, // 50 per hour
} as const;

export type EndpointName = keyof typeof RATE_LIMITS;

/**
 * Check rate limit for a user and endpoint
 * Returns true if allowed, throws error if rate limited
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  endpoint: EndpointName
): Promise<void> {
  const config = RATE_LIMITS[endpoint];
  if (!config) return; // No limit configured
  
  try {
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_user_id: userId,
      p_endpoint: endpoint,
      p_max_requests: config.maxRequests,
      p_window_seconds: config.windowSeconds,
    });
    
    if (error) {
      console.error("Rate limit check error:", error);
      // Don't block on rate limit check errors, just log
      return;
    }
    
    if (data === false) {
      throw new RateLimitError(
        `Rate limit exceeded for ${endpoint}. Maximum ${config.maxRequests} requests per hour.`
      );
    }
  } catch (e) {
    if (e instanceof RateLimitError) throw e;
    console.error("Rate limit check failed:", e);
    // Don't block on unexpected errors
  }
}

/**
 * Custom rate limit error class
 */
export class RateLimitError extends Error {
  public retryAfter: number;
  
  constructor(message: string, retryAfterSeconds = 60) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfter = retryAfterSeconds;
  }
}

/**
 * Create a 429 rate limit response
 */
export function createRateLimitResponse(
  error: RateLimitError,
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({ 
      error: "Too many requests. Please wait and try again.",
      retryAfter: error.retryAfter 
    }),
    { 
      status: 429, 
      headers: { 
        ...corsHeaders, 
        "Content-Type": "application/json",
        "Retry-After": String(error.retryAfter)
      } 
    }
  );
}
