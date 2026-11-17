// Publish webhook: the CMS calls this after an editor publishes, so the page updates immediately
// instead of waiting for the ISR interval.
//   curl -X POST https://site/api/revalidate -H "x-revalidate-secret: $REVALIDATE_SECRET" -d '{"slug":"/about"}'
import { normalizeSlug } from "@contentcore/core";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || request.headers.get("x-revalidate-secret") !== secret) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const { slug } = (await request.json().catch(() => ({}))) as { slug?: unknown };
  if (typeof slug !== "string") return Response.json({ ok: false, error: "slug required" }, { status: 400 });
  revalidatePath(normalizeSlug(slug));
  return Response.json({ ok: true, revalidated: normalizeSlug(slug) });
}
