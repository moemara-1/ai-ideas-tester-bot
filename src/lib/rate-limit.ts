/**
 * Simple in-memory rate limiter for API endpoints
 * 
 * IMPORTANT: This implementation is suitable for single-instance deployments only.
 * For multi-instance deployments (e.g., Vercel Pro, AWS, Kubernetes), each instance
 * maintains its own rate limit state, which means:
 * - Rate limits are not shared across instances
 * - A user could potentially exceed limits by hitting different instances
 * 
 * For production multi-instance deployments, consider:
 * - Using Redis-based rate limiting (e.g., ioredis with INCR + EXPIRE)
 * - Using a rate limiting service like Cloudflare Rate Limiting
 * - Using a dedicated rate limiting provider (e.g., Upstash, Railway)
 * 
 * The cleanup interval runs every 60 seconds to remove expired entries.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Maximum requests per window
}

/**
 * Default rate limits for different endpoints
 */
export const RATE_LIMITS = {
  discovery: { windowMs: 60000, maxRequests: 5 },      // 5 requests per minute
  scoring: { windowMs: 60000, maxRequests: 10 },      // 10 requests per minute
  generate: { windowMs: 60000, maxRequests: 10 },     // 10 requests per minute
  default: { windowMs: 60000, maxRequests: 30 },      // 30 requests per minute
} as const;

/**
 * Get client IP from request headers
 */
function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Check if request is within rate limit
 * Returns true if allowed, false if rate limited
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    // New window
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return true;
  }

  if (entry.count >= config.maxRequests) {
    // Rate limited
    return false;
  }

  // Increment counter
  entry.count++;
  return true;
}

/**
 * Get rate limit info for response headers
 */
export function getRateLimitHeaders(
  key: string,
  config: RateLimitConfig
): Record<string, string> {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    return {
      "X-RateLimit-Limit": config.maxRequests.toString(),
      "X-RateLimit-Remaining": config.maxRequests.toString(),
      "X-RateLimit-Reset": Math.ceil((now + config.windowMs) / 1000).toString(),
    };
  }

  return {
    "X-RateLimit-Limit": config.maxRequests.toString(),
    "X-RateLimit-Remaining": Math.max(0, config.maxRequests - entry.count).toString(),
    "X-RateLimit-Reset": Math.ceil(entry.resetAt / 1000).toString(),
  };
}

/**
 * Middleware helper for rate limiting
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  return {
    check: (request: Request) => {
      const ip = getClientIp(request);
      return checkRateLimit(`ratelimit:${ip}`, config);
    },
    getHeaders: (request: Request) => {
      const ip = getClientIp(request);
      return getRateLimitHeaders(`ratelimit:${ip}`, config);
    },
  };
}

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);
