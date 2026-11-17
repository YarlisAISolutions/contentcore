// The content API the browser source reads: GET /api/content/pages?slug=/about&locale=fr
// Implements the createApiSource contract: JSON page or 404, ETag + 304, CDN cache headers.
import { normalizeSlug } from "@contentcore/core";
import { rawPages } from "@/lib/content";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = normalizeSlug(url.searchParams.get("slug") ?? "/");
  const locale = url.searchParams.get("locale") ?? undefined;
  const page =
    rawPages.find((p) => p.slug === slug && "locale" in p && p.locale === locale) ??
    rawPages.find((p) => p.slug === slug && !("locale" in p));
  if (!page) return Response.json(null, { status: 404 });

  const body = JSON.stringify(page);
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(body));
  const etag = `"${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}"`;
  const headers = {
    etag,
    "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
  };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers: { ...headers, "content-type": "application/json" } });
}
