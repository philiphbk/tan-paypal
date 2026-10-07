"use client";

export type Role = "buyer" | "seller" | "reviewer";
type Keys = Record<string, Partial<Record<Role, string>>>;

const STORE = "tan.keys.v1";
const REVIEWER = "tan.reviewerKey";

function load(): Keys {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}") as Keys;
  } catch {
    return {};
  }
}

function save(k: Keys) {
  try {
    localStorage.setItem(STORE, JSON.stringify(k));
  } catch {
    /* storage unavailable (private mode): links still work for this page load */
  }
}

/** Remember capability tokens for a deal (merges with what is already held). */
export function addKeys(dealId: string, tokens: Partial<Record<Role, string>>) {
  const all = load();
  all[dealId] = { ...all[dealId], ...tokens };
  save(all);
}

export const heldKeys = (dealId: string): Partial<Record<Role, string>> => load()[dealId] ?? {};
export const heldRoles = (dealId: string): Role[] => Object.keys(heldKeys(dealId)) as Role[];

export function forgetDeals(ids: string[]) {
  const all = load();
  ids.forEach((id) => delete all[id]);
  save(all);
}

/** Header value sent with every API call: "<dealId>.<token>,..." */
export function keysHeader(): string {
  const parts: string[] = [];
  for (const [id, roles] of Object.entries(load())) {
    for (const tok of Object.values(roles)) if (tok) parts.push(`${id}.${tok}`);
  }
  return parts.slice(-150).join(",");
}

export const getReviewerKey = (): string => {
  try { return localStorage.getItem(REVIEWER) ?? ""; } catch { return ""; }
};
export const setReviewerKey = (v: string) => {
  try { v ? localStorage.setItem(REVIEWER, v) : localStorage.removeItem(REVIEWER); } catch { /* ignore */ }
};

/** If the URL carries ?k=<role>.<token>, store it and remove it from the address bar. */
export function absorbKeyFromUrl(dealId: string): boolean {
  const url = new URL(window.location.href);
  const k = url.searchParams.get("k");
  if (!k) return false;
  const i = k.indexOf(".");
  const role = k.slice(0, i) as Role;
  const tok = k.slice(i + 1);
  if (i > 0 && ["buyer", "seller", "reviewer"].includes(role) && tok) addKeys(dealId, { [role]: tok });
  url.searchParams.delete("k");
  window.history.replaceState({}, "", url.pathname + url.search);
  return true;
}

export function shareLink(dealId: string, role: Role): string | null {
  const tok = heldKeys(dealId)[role];
  return tok ? `${window.location.origin}/deals/${dealId}/${role}?k=${role}.${tok}` : null;
}
