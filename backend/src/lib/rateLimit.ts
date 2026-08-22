import type { NextFunction, Request, Response } from "express";

/**
 * Minimal fixed-window rate limiter, keyed by client IP per limiter instance.
 *
 * In-process and therefore per-instance only; that is sufficient here because
 * the service is a single-process SQLite app. Implemented locally rather than
 * pulling in express-rate-limit to avoid adding a dependency for ~30 lines.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** Requests permitted per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Message returned once the limit is exceeded. */
  message?: string;
}

export function rateLimit({ max, windowMs, message }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  // Bound memory: drop expired buckets rather than retaining every IP forever.
  function sweep(now: number) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    if (buckets.size > 1_000) sweep(now);

    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        message: message ?? "Too many requests. Please retry later.",
        retryAfterSeconds: retryAfterSec
      });
    }

    return next();
  };
}
