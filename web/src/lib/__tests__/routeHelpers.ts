import os from "node:os";
import path from "node:path";
import fs from "node:fs";

/** Point the store at a fresh temp database. Call before anything touches the store. */
export function useTempDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tan-test-"));
  process.env.DATABASE_PATH = path.join(dir, "test.db");
  return process.env.DATABASE_PATH;
}

export function keyHeader(...pairs: [string, string][]): string {
  return pairs.map(([id, tok]) => `${id}.${tok}`).join(",");
}

export function call(
  handler: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>,
  id: string,
  opts: { body?: unknown; keys?: string; ip?: string; method?: string } = {},
) {
  const req = new Request("http://localhost/test", {
    method: opts.method ?? "POST",
    headers: {
      "content-type": "application/json",
      "x-deal-keys": opts.keys ?? "",
      "x-forwarded-for": opts.ip ?? "10.0.0.1",
    },
    body: opts.method === "GET" ? undefined : JSON.stringify(opts.body ?? {}),
  });
  return handler(req, { params: Promise.resolve({ id }) });
}

export async function json<T = Record<string, any>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
