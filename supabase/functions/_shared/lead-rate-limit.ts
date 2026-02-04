// IP-based rate limiting for anonymous lead submissions
// Uses in-memory store with sliding window

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// In-memory store (per edge function instance)
const ipLimits = new Map<string, RateLimitEntry>();

// Configuration
const MAX_LEADS_PER_IP = 5;  // Max leads per IP per window
const WINDOW_MS = 60 * 60 * 1000; // 1 hour window

/**
 * Check if an IP is rate limited for lead submission
 * Returns true if allowed, false if rate limited
 */
export function checkLeadRateLimit(clientIp: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = ipLimits.get(clientIp);
  
  // Clean up old entries periodically
  if (ipLimits.size > 10000) {
    const cutoff = now - WINDOW_MS;
    for (const [ip, e] of ipLimits) {
      if (e.windowStart < cutoff) {
        ipLimits.delete(ip);
      }
    }
  }
  
  if (!entry || (now - entry.windowStart) > WINDOW_MS) {
    // New window
    ipLimits.set(clientIp, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_LEADS_PER_IP - 1, resetIn: WINDOW_MS };
  }
  
  if (entry.count >= MAX_LEADS_PER_IP) {
    const resetIn = WINDOW_MS - (now - entry.windowStart);
    return { allowed: false, remaining: 0, resetIn };
  }
  
  // Increment count
  entry.count++;
  ipLimits.set(clientIp, entry);
  
  return { 
    allowed: true, 
    remaining: MAX_LEADS_PER_IP - entry.count,
    resetIn: WINDOW_MS - (now - entry.windowStart)
  };
}

/**
 * Get client IP from request headers
 */
export function getClientIp(req: Request): string {
  // Check common proxy headers
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  
  // Fallback (not ideal but prevents null)
  return "unknown";
}

/**
 * Validate email format strictly
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false; // RFC 5321 limit
  
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email);
}
