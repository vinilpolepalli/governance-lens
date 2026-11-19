import { ApiError } from "./errors";

/**
 * In-memory sliding-window limiter.
 * SINGLE-INSTANCE CAVEAT: state lives in this process only. With several server instances (or serverless
 * cold starts) each has its own counters, so limits are per-instance and reset on restart. Use a shared
 * store (Redis/DB) if this ever runs on more than one instance. Owners are anonymous cookies, so a client
 * that discards its cookie gets a fresh bucket; the global company cap is the backstop for that.
 */
const hits = new Map<string, number[]>();
const HOUR = 3_600_000;

/** Record one hit for `key`; throws ApiError 429 `rate_limited` (with retryAfterSec) when over `limit` per hour. */
export function rateLimit(key: string, limit: number, windowMs = HOUR): void {
  const t = Date.now();
  const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    const retryAfterSec = Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000));
    throw new ApiError(429, "rate_limited", `Too many requests. Try again in about ${Math.ceil(retryAfterSec / 60)} minute(s).`, { retryAfterSec });
  }
  recent.push(t);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (t - v[v.length - 1] >= windowMs) hits.delete(k);
}
