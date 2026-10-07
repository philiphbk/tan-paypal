/**
 * Thin Anthropic Messages API client shared by the agreement builder and the
 * verifier agent. Structured output is obtained by forcing a single tool call,
 * so the model returns JSON matching a schema instead of free text we have to
 * parse. Callers must still validate the result: the model output is untrusted.
 */

const API_URL = "https://api.anthropic.com/v1/messages";

export const llmEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

export const modelName = () => process.env.AI_MODEL ?? "claude-sonnet-5-5";

/**
 * Wrap untrusted text in a tagged block. Any closing tag inside the text is
 * neutralised so the content cannot break out of the block it is placed in.
 */
export function untrusted(tag: string, text: string): string {
  const safe = text.replace(new RegExp(`<\\/?\\s*${tag}\\b[^>]*>`, "gi"), "[tag removed]");
  return `<${tag}>\n${safe}\n</${tag}>`;
}

export async function callModelForJson(args: {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<unknown> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelName(),
      max_tokens: args.maxTokens ?? 1024,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
      tools: [
        {
          name: args.toolName,
          description: args.toolDescription,
          input_schema: args.inputSchema,
        },
      ],
      tool_choice: { type: "tool", name: args.toolName },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Model API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    content: { type: string; name?: string; input?: unknown }[];
  };
  const call = data.content.find((c) => c.type === "tool_use" && c.name === args.toolName);
  if (!call?.input) throw new Error("Model did not return the requested structured output");
  return call.input;
}
