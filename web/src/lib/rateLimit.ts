import { NextResponse } from "next/server";

/**
 * Fixed-window, in-memory rate limiter keyed by client IP. Good enough for one
 * Render instance; a multi-instance deployment would move this to Redis.
 * The client IP comes from x-forwarded-for, which is only trustworthy behind a
 * proxy that sets it (Render does).
 */
interface Window { n: number; reset: number }
const g = globalThis as unknown as { __rl?: Map<string, Window> };
const buckets = (g.__rl ??= new Map<string, Window>());

export const LIMITS = {
  /** Anything that can call the LLM. */
  llm: { max: 10, windowMs: 60_000 },
  /** Actions that write to PayPal or change a deal. */
  write: { max: 40, windowMs: 60_000 },
  /** Creating deals. */
  create: { max: 20, windowMs: 3_600_000 },
  /** Uploading evidence files. */
  upload: { max: 10, windowMs: 60_000 },
} as const;

export type LimitName = keyof typeof LIMITS;

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip")) || "local";
}

/** Returns a 429 response when the caller is over the limit, otherwise null. */
export function rateLimit(req: Request, name: LimitName, now = Date.now()): NextResponse | null {
  if (process.env.RATE_LIMIT_DISABLED === "1") return null;
  const { max, windowMs } = LIMITS[name];
  const key = `${name}:${clientIp(req)}`;
  let w = buckets.get(key);
  if (!w || w.reset <= now) {
    w = { n: 0, reset: now + windowMs };
    buckets.set(key, w);
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
  }
  w.n += 1;
  if (w.n <= max) return null;
  const retry = Math.max(1, Math.ceil((w.reset - now) / 1000));
  return NextResponse.json(
    { error: `Too many requests. Try again in ${retry}s.` },
    { status: 429, headers: { "Retry-After": String(retry) } },
  );
}

export function resetRateLimits() {
  buckets.clear();
}
