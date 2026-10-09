/**
 * Thin Anthropic Messages API client shared by the agreement builder and the
 * verifier agent. Structured output is obtained by forcing a single tool call,
 * so the model returns JSON matching a schema instead of free text we have to
 * parse. Callers must still validate the result: the model output is untrusted.
 */

import { modelName, positiveNumber } from "./config";

const API_URL = "https://api.anthropic.com/v1/messages";

export const llmEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

/**
 * Hard daily ceiling on model calls (LLM_DAILY_CAP, default 300) so a public
 * demo cannot run up the bill. When it is reached, callers see an error and
 * fall back to their offline rules.
 */
const g = globalThis as unknown as { __llmUse?: { day: string; n: number } };
export function spendLlmBudget(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const use = (g.__llmUse = g.__llmUse?.day === day ? g.__llmUse : { day, n: 0 });
  const cap = positiveNumber(process.env.LLM_DAILY_CAP, 300);
  if (use.n >= cap) throw new Error("Daily AI budget reached; using offline rules");
  use.n += 1;
}
export const resetLlmBudget = () => { g.__llmUse = undefined; };

export { modelName };

/**
 * Wrap untrusted text in a tagged block. Any closing tag inside the text is
 * neutralised so the content cannot break out of the block it is placed in.
 */
export function untrusted(tag: string, text: string): string {
  const safe = text.replace(new RegExp(`<\\/?\\s*${tag}\\b[^>]*>`, "gi"), "[tag removed]");
  return `<${tag}>\n${safe}\n</${tag}>`;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export type Effort = "low" | "medium" | "high";

/**
 * Ask the model for structured output by having it call one tool.
 *
 * Newer models reject a *forced* tool choice (`tool_choice` of type "tool" or
 * "any" is a 400), so this uses `auto` and an explicit instruction instead, and
 * the caller re-validates whatever comes back (the model's output is untrusted
 * either way). Thinking is left at the model default; its tokens count towards
 * max_tokens, so the limits here leave room for it. Effort is set per call
 * because it is the main cost/latency lever.
 */
export async function callModelForJson(args: {
  system: string;
  user: string | ContentBlock[];
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  maxTokens?: number;
  effort?: Effort;
}): Promise<unknown> {
  spendLlmBudget();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelName(),
      max_tokens: args.maxTokens ?? 4096,
      system: `${args.system}\n\nRespond by calling the ${args.toolName} tool exactly once. Do not answer in plain text.`,
      messages: [{ role: "user", content: args.user }],
      tools: [
        {
          name: args.toolName,
          description: args.toolDescription,
          input_schema: args.inputSchema,
        },
      ],
      tool_choice: { type: "auto" },
      output_config: { effort: args.effort ?? "medium" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Model API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    stop_reason?: string;
    content: { type: string; name?: string; input?: unknown }[];
  };
  const call = data.content?.find((c) => c.type === "tool_use" && c.name === args.toolName);
  if (call?.input) return call.input;
  // Say why there was no answer: a refusal and a truncation need different responses.
  if (data.stop_reason === "refusal") throw new Error("The model declined this request");
  if (data.stop_reason === "max_tokens") throw new Error("The model ran out of tokens before answering");
  throw new Error("The model did not return the requested structured output");
}
