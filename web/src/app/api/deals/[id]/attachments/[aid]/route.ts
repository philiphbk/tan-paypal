import { NextResponse } from "next/server";
import { canRead, rolesFor } from "@/lib/access";
import { getAttachment } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Serve an uploaded evidence image to anyone holding a link for the deal. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = await params;
  if (!canRead(rolesFor(req, id))) {
    return NextResponse.json({ error: "You need an access link for this deal." }, { status: 403 });
  }
  const f = getAttachment(id, aid);
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mime,
      "Content-Length": String(f.size),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // Images only: forbid anything else from ever executing in this response.
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
