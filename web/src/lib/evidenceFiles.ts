/** Limits and validation for evidence attachments. Nothing here trusts the client's claims. */
export const MAX_IMAGES = 3;
export const MAX_IMAGE_BYTES = 1_500_000;
export const MAX_LINKS = 5;
/** Request body ceiling for evidence: three base64 images plus text. */
export const MAX_EVIDENCE_BODY = 6_500_000;

export type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/** Identify an image by its magic bytes, never by the declared type or file name. */
export function sniffImage(b: Buffer): ImageMime | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.length >= 6 && ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("latin1"))) return "image/gif";
  return null;
}

export const safeName = (n: unknown): string =>
  String(n ?? "image").replace(/[^\w.\- ]+/g, "").replace(/^\.+/, "").trim().slice(0, 60) || "image";

export interface ParsedImage { name: string; mime: ImageMime; data: Buffer }

export function parseImages(raw: unknown): { ok: true; files: ParsedImage[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, files: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "images must be a list" };
  if (raw.length > MAX_IMAGES) return { ok: false, error: `At most ${MAX_IMAGES} images per submission.` };
  const files: ParsedImage[] = [];
  for (const item of raw) {
    const o = (item ?? {}) as { name?: unknown; data?: unknown };
    if (typeof o.data !== "string" || o.data.length === 0) return { ok: false, error: "Each image needs base64 data." };
    const b64 = o.data.replace(/^data:[^,]*,/, "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { ok: false, error: "Image data is not valid base64." };
    const data = Buffer.from(b64, "base64");
    if (data.length > MAX_IMAGE_BYTES) return { ok: false, error: `Each image must be under ${Math.round(MAX_IMAGE_BYTES / 1e5) / 10} MB.` };
    const mime = sniffImage(data);
    if (!mime) return { ok: false, error: "Only PNG, JPEG, WebP or GIF images are accepted." };
    files.push({ name: safeName(o.name), mime, data });
  }
  return { ok: true, files };
}

/** Accept only plain https URLs without credentials. Returns the cleaned list. */
export function parseLinks(raw: unknown): { ok: true; urls: string[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, urls: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "links must be a list" };
  if (raw.length > MAX_LINKS) return { ok: false, error: `At most ${MAX_LINKS} links per submission.` };
  const urls: string[] = [];
  for (const item of raw) {
    try {
      const u = new URL(String(item).trim());
      if (u.protocol !== "https:" || u.username || u.password) throw new Error();
      urls.push(u.toString().slice(0, 500));
    } catch {
      return { ok: false, error: `Not a valid https link: ${String(item).slice(0, 80)}` };
    }
  }
  return { ok: true, urls };
}
