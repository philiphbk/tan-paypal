import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Actor, Agreement, Deal } from "./types";

/**
 * SQLite-backed store. Same functions as the old in-memory store, plus
 * `saveDeal` (explicit persistence) and `withDeal` (serialised read-modify-write
 * per deal, which also stops double-clicks from racing each other).
 *
 * Each deal is stored as one JSON document with a few indexed lookup columns.
 * Set DATABASE_PATH to move the file (e.g. onto a Render persistent disk).
 */
const g = globalThis as unknown as { __db?: Database.Database; __locks?: Map<string, Promise<unknown>> };

function open(): Database.Database {
  const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "tan.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS deals_order ON deals (json_extract(data, '$.paypal.orderId'));
    CREATE INDEX IF NOT EXISTS deals_payout ON deals (json_extract(data, '$.payout.batchId'));
    CREATE TABLE IF NOT EXISTS webhook_seen (event_id TEXT PRIMARY KEY, seen_at TEXT NOT NULL);
  `);
  return db;
}

const db = () => (g.__db ??= open());
const locks = (g.__locks ??= new Map<string, Promise<unknown>>());

const parse = (row?: { data: string }): Deal | undefined => (row ? (JSON.parse(row.data) as Deal) : undefined);

export function saveDeal(deal: Deal): void {
  db()
    .prepare(
      `INSERT INTO deals (id, state, created_at, updated_at, data) VALUES (@id, @state, @createdAt, @updatedAt, @data)
       ON CONFLICT(id) DO UPDATE SET state = @state, updated_at = @updatedAt, data = @data`,
    )
    .run({ id: deal.id, state: deal.state, createdAt: deal.createdAt, updatedAt: deal.updatedAt, data: JSON.stringify(deal) });
}

export function createDeal(
  agreement: Omit<Agreement, "version">,
  buyerLabel = "Buyer",
  sellerLabel = "Seller",
  proposer: Actor = "human_buyer",
): Deal {
  const now = new Date().toISOString();
  const deal: Deal = {
    id: randomUUID(),
    state: "DRAFT",
    agreement: { ...agreement, version: 1 },
    buyerLabel,
    sellerLabel,
    paypal: {},
    events: [{ at: now, type: "AGREEMENT_PROPOSED", detail: agreement.title, actor: proposer }],
    createdAt: now,
    updatedAt: now,
  };
  saveDeal(deal);
  return deal;
}

export const getDeal = (id: string) =>
  parse(db().prepare("SELECT data FROM deals WHERE id = ?").get(id) as { data: string } | undefined);

export const listDeals = (): Deal[] =>
  (db().prepare("SELECT data FROM deals ORDER BY created_at DESC").all() as { data: string }[]).map(
    (r) => JSON.parse(r.data) as Deal,
  );

export const findDealByOrderId = (orderId: string) =>
  parse(db().prepare("SELECT data FROM deals WHERE json_extract(data, '$.paypal.orderId') = ?").get(orderId) as { data: string } | undefined);

export const findDealByPayoutBatchId = (batchId: string) =>
  parse(db().prepare("SELECT data FROM deals WHERE json_extract(data, '$.payout.batchId') = ?").get(batchId) as { data: string } | undefined);

/** Returns true the first time an event id is seen (idempotent webhook handling). */
export function markWebhookSeen(eventId: string): boolean {
  const res = db()
    .prepare("INSERT OR IGNORE INTO webhook_seen (event_id, seen_at) VALUES (?, ?)")
    .run(eventId, new Date().toISOString());
  return res.changes === 1;
}

/** Remove every deal (demo reset). Webhook ids are kept so replays stay ignored. */
export function deleteAllDeals(): void {
  db().prepare("DELETE FROM deals").run();
}

/**
 * Run `fn` with a freshly loaded deal while holding that deal's lock, and save
 * the deal afterwards even if `fn` throws or returns an error response.
 * Returns undefined if the deal does not exist.
 */
export async function withDeal<T>(id: string, fn: (deal: Deal) => Promise<T>): Promise<T | undefined> {
  const prev = locks.get(id) ?? Promise.resolve();
  const run = prev.then(async () => {
    const deal = getDeal(id);
    if (!deal) return undefined;
    try {
      return await fn(deal);
    } finally {
      saveDeal(deal);
    }
  });
  const tail = run.catch(() => undefined);
  locks.set(id, tail);
  tail.then(() => {
    if (locks.get(id) === tail) locks.delete(id);
  });
  return run;
}
