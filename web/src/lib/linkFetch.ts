import dns from "node:dns/promises";
import net from "node:net";

/**
 * Optional: open evidence links so the verifier can read them. OFF unless
 * EVIDENCE_FETCH_LINKS=1, because fetching a URL chosen by the seller is an SSRF
 * risk. Defences: https only, port 443, no credentials, every resolved address
 * must be public, redirects are followed manually and re-checked each hop,
 * 5 s timeout, 200 KB read cap, text types only.
 * Residual risk: DNS can change between our lookup and fetch's own lookup
 * (rebinding). Run with this off on any instance that can reach private networks.
 */
export const fetchLinksEnabled = () => process.env.EVIDENCE_FETCH_LINKS === "1";

export function isPrivateAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast, reserved, broadcast
    );
  }
  if (kind === 6) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7)); // IPv4-mapped
    return v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
  }
  return true; // not an IP: treat as unsafe
}

async function assertPublic(u: URL) {
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) throw new Error("link is not a plain https URL");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) throw new Error("link points at a local name");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) throw new Error("link resolves to a private address");
}

export interface FetchedPage { url: string; status: "fetched" | "blocked" | "failed"; excerpt?: string; note?: string }

export async function fetchEvidenceLink(url: string): Promise<FetchedPage> {
  try {
    let current = new URL(url);
    for (let hop = 0; hop < 4; hop++) {
      await assertPublic(current);
      const res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(5000), headers: { "user-agent": "TAN-evidence-check/1.0", accept: "text/html,text/plain,application/json" } });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) throw new Error("redirect without a location");
        current = new URL(loc, current);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get("content-type") ?? "";
      if (!/^(text\/(html|plain)|application\/json)/i.test(type)) throw new Error(`unsupported content type ${type.split(";")[0] || "unknown"}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("empty response");
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < 200_000) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        total += value.length;
      }
      reader.cancel().catch(() => {});
      const text = Buffer.concat(chunks).toString("utf8")
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { url, status: "fetched", excerpt: text.slice(0, 3000) };
    }
    throw new Error("too many redirects");
  } catch (err) {
    const msg = (err as Error).message;
    return { url, status: /private|local|plain https/.test(msg) ? "blocked" : "failed", note: msg.slice(0, 120) };
  }
}
