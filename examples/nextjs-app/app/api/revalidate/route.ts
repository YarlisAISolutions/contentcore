// Publish webhook: the CMS calls this after an editor publishes, so the page updates immediately
// instead of waiting for the ISR interval.
//   curl -X POST https://site/api/revalidate -H "x-revalidate-secret: $REVALIDATE_SECRET" -d '{"slug":"/about"}'
import { normalizeSlug } from "@contentcore/core";
import { revalidatePath } from "next/cache";

const enc = new TextEncoder();

/** Constant-time comparison of SHA-256 digests, so response timing reveals nothing about the secret. */
async function sameSecret(given: string, expected: string) {
  const [a, b] = await Promise.all([given, expected].map((v) => crypto.subtle.digest("SHA-256", enc.encode(v))));
  const x = new Uint8Array(a as ArrayBuffer);
  const y = new Uint8Array(b as ArrayBuffer);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= (x[i] as number) ^ (y[i] as number);
  return diff === 0;
}

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || !(await sameSecret(request.headers.get("x-revalidate-secret") ?? "", secret))) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const { slug } = (await request.json().catch(() => ({}))) as { slug?: unknown };
  if (typeof slug !== "string") return Response.json({ ok: false, error: "slug required" }, { status: 400 });
  revalidatePath(normalizeSlug(slug));
  return Response.json({ ok: true, revalidated: normalizeSlug(slug) });
}
