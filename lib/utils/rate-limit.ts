/**
 * Lightweight in-memory rate limiter for Next.js API routes.
 *
 * Note: In-memory state is per-serverless-instance. This protects against
 * rapid brute-force attacks on the same Vercel function instance. For
 * distributed rate limiting across all instances, use Upstash Redis instead.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Periodically clean up expired entries to prevent memory leaks
function cleanup() {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanup, 5 * 60 * 1000);
}

export interface RateLimitResult {
  success: boolean;
  retryAfter: number; // seconds until reset (0 if success)
}

/**
 * Check rate limit for a given key.
 * @param key      Unique identifier (e.g. `login:1.2.3.4`)
 * @param limit    Max requests allowed in the window
 * @param windowMs Time window in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, retryAfter: 0 };
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { success: false, retryAfter };
  }

  entry.count += 1;
  return { success: true, retryAfter: 0 };
}

/**
 * Extract client IP from a Next.js request.
 * Falls back to 'unknown' if no IP header is present.
 */
export function getClientIp(request: Request): string {
  const forwarded = (request.headers as Headers).get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return (request.headers as Headers).get('x-real-ip') ?? 'unknown';
}
