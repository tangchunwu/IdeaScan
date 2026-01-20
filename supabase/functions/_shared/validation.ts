// Shared validation utilities for edge functions

/**
 * Validation limits
 */
export const LIMITS = {
  IDEA_MAX_LENGTH: 5000,
  TAG_MAX_COUNT: 10,
  TAG_MAX_LENGTH: 50,
  USER_REPLY_MAX_LENGTH: 2000,
  API_KEY_MAX_LENGTH: 500,
  URL_MAX_LENGTH: 500,
  MODEL_MAX_LENGTH: 100,
  UUID_REGEX: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
} as const;

/**
 * Allowed base URL domains for LLM providers
 */
export const ALLOWED_LLM_DOMAINS = [
  "api.openai.com",
  "api.deepseek.com",
  "api.anthropic.com",
  "ai.gateway.lovable.dev",
  "api.groq.com",
  "api.together.xyz",
  "openrouter.ai",
  "api.mistral.ai",
  "generativelanguage.googleapis.com",
] as const;

/**
 * Validate a string field with length limit
 */
export function validateString(
  value: unknown,
  fieldName: string,
  maxLength: number,
  required = false
): string | null {
  if (value === undefined || value === null) {
    if (required) {
      throw new ValidationError(`${fieldName} is required`);
    }
    return null;
  }
  
  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName} must be a string`);
  }
  
  const trimmed = value.trim();
  
  if (required && trimmed.length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`);
  }
  
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${fieldName} exceeds maximum length of ${maxLength} characters`);
  }
  
  return trimmed;
}

/**
 * Validate an array of strings (like tags)
 */
export function validateStringArray(
  value: unknown,
  fieldName: string,
  maxCount: number,
  maxItemLength: number
): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`);
  }
  
  if (value.length > maxCount) {
    throw new ValidationError(`${fieldName} exceeds maximum of ${maxCount} items`);
  }
  
  return value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim().slice(0, maxItemLength))
    .filter(item => item.length > 0);
}

/**
 * Validate a UUID
 */
export function validateUUID(value: unknown, fieldName: string): string {
  const str = validateString(value, fieldName, 36, true);
  if (!str || !LIMITS.UUID_REGEX.test(str)) {
    throw new ValidationError(`${fieldName} must be a valid UUID`);
  }
  return str;
}

/**
 * Validate a base URL against allowlist
 */
export function validateBaseUrl(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  
  const url = validateString(value, fieldName, LIMITS.URL_MAX_LENGTH);
  if (!url) return null;
  
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    
    // Check against allowlist
    const isAllowed = ALLOWED_LLM_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith(`.${domain}`)
    );
    
    if (!isAllowed) {
      throw new ValidationError(`${fieldName} must be from an allowed provider domain`);
    }
    
    return url;
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw new ValidationError(`${fieldName} must be a valid URL`);
  }
}

/**
 * Validate search provider
 */
export function validateSearchProvider(value: unknown): "bocha" | "you" | "tavily" | null {
  if (value === undefined || value === null) {
    return null;
  }
  
  const providers = ["bocha", "you", "tavily"] as const;
  if (typeof value !== "string" || !providers.includes(value as any)) {
    throw new ValidationError("Invalid search provider. Must be 'bocha', 'you', or 'tavily'");
  }
  
  return value as "bocha" | "you" | "tavily";
}

/**
 * Validate config type for verify-config
 */
export function validateConfigType(value: unknown): "llm" | "image_gen" | "search" {
  const types = ["llm", "image_gen", "search"] as const;
  if (typeof value !== "string" || !types.includes(value as any)) {
    throw new ValidationError("Invalid config type. Must be 'llm', 'image_gen', or 'search'");
  }
  return value as "llm" | "image_gen" | "search";
}

/**
 * Sanitize text for use in AI prompts to prevent prompt injection
 */
export function sanitizeForPrompt(text: string): string {
  // Remove common prompt injection patterns
  return text
    .replace(/```/g, "'''")
    .replace(/\[INST\]/gi, "")
    .replace(/\[\/INST\]/gi, "")
    .replace(/<\|.*?\|>/g, "")
    .replace(/system:/gi, "sys:")
    .replace(/user:/gi, "usr:")
    .replace(/assistant:/gi, "asst:")
    .slice(0, 10000); // Hard limit
}

/**
 * Custom validation error class
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Create a generic error response (hides implementation details)
 */
export function createErrorResponse(
  error: unknown,
  corsHeaders: Record<string, string>
): Response {
  // Log detailed error server-side only
  console.error("Edge function error:", error);
  
  // Determine user-facing message
  let message = "An error occurred. Please try again.";
  let status = 500;
  
  if (error instanceof ValidationError) {
    message = error.message;
    status = 400;
  } else if (error instanceof Error) {
    // Map known error patterns to generic messages
    const msg = error.message.toLowerCase();
    
    if (msg.includes("authorization") || msg.includes("token") || msg.includes("auth")) {
      message = "Authentication required. Please sign in again.";
      status = 401;
    } else if (msg.includes("not found")) {
      message = "The requested resource was not found.";
      status = 404;
    } else if (msg.includes("rate limit")) {
      message = "Too many requests. Please wait and try again.";
      status = 429;
    } else if (msg.includes("required")) {
      message = error.message;
      status = 400;
    }
  }
  
  return new Response(
    JSON.stringify({ error: message }),
    { 
      status, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    }
  );
}
