/**
 * Canonical slug form: leading "/", no trailing "/" (except the root), no repeated slashes,
 * no query or hash. "about/", "/about" and "//about/" all become "/about".
 */
export function normalizeSlug(slug: string): string {
  const path = slug.split(/[?#]/, 1)[0] ?? "";
  const parts = path.split("/").filter(Boolean);
  return `/${parts.join("/")}`;
}
