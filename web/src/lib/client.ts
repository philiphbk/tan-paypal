"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Deal } from "./types";
import { getReviewerKey, keysHeader } from "./keys";

export async function api<T = unknown>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "x-deal-keys": keysHeader(),
      "x-reviewer-key": getReviewerKey(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? res.statusText);
  return json as T;
}

/** Load a deal and keep it fresh (every 2.5s) until it reaches a final state. */
export function useDeal(id: string) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const stopped = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const { deal } = await api<{ deal: Deal }>(`/api/deals/${id}`);
      setDeal(deal);
      const payoutSettled =
        !deal.sellerEmail ||
        (deal.payout && !["PENDING", "PROCESSING"].includes(deal.payout.batchStatus)) ||
        deal.events.some((e) => e.type === "PAYOUT_FAILED" || e.type === "PAYOUT_SKIPPED");
      stopped.current = deal.state === "REFUNDED" || (deal.state === "CAPTURED" && !!payoutSettled);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    refresh();
    const t = setInterval(() => {
      if (!stopped.current && document.visibilityState === "visible") refresh();
    }, 2500);
    return () => clearInterval(t);
  }, [refresh]);

  /** Run an action; show its error (if any) and refresh afterwards. */
  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError("");
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
        await refresh();
      }
    },
    [refresh],
  );

  return { deal, error, setError, busy, act, refresh };
}
