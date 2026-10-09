/**
 * Environment settings, read defensively. A variable that exists but is blank
 * (copied from a template, or added empty in a dashboard) must behave like a
 * missing one, so none of these use `??`, which would let "" through.
 */
type Env = Record<string, string | undefined>;

/** Public origin of this app, for PayPal return/cancel URLs. Always absolute. */
export function appBaseUrl(env: Env = process.env): string {
  for (const v of [env.APP_BASE_URL, env.RENDER_EXTERNAL_URL]) {
    const t = v?.trim();
    if (!t) continue;
    try {
      const u = new URL(t);
      if (u.protocol === "http:" || u.protocol === "https:") return u.origin;
    } catch {
      /* not a URL: try the next source */
    }
  }
  return "http://localhost:3000";
}

/** A positive number from the environment, or the default if it is blank, zero or not a number. */
export function positiveNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw?.trim());
  return raw?.trim() && Number.isFinite(n) && n > 0 ? n : fallback;
}

export const maxAutoReleaseAmount = (env: Env = process.env) => positiveNumber(env.BUYER_AGENT_MAX_AMOUNT, 500);

export const modelName = (env: Env = process.env) => env.AI_MODEL?.trim() || "claude-sonnet-5-5";
