import { type CmsFallbacks, type CmsIssue, CmsPage, CmsProvider } from "@contentcore/react";
import { useState } from "react";
import { blocks } from "./blocks";
import { api, source } from "./content";
import { Link, usePath } from "./router";

// Fallbacks and the issue reporter are module-level constants: stable identities, no re-renders.
const fallbacks: CmsFallbacks = {
  loading: <p aria-busy="true">Loading…</p>,
  notFound: (slug) => (
    <section>
      <h1>Not found</h1>
      <p>No page at {slug}.</p>
    </section>
  ),
  error: (_error, retry) => (
    <p role="alert">
      Could not load this page.{" "}
      <button type="button" onClick={retry}>
        Try again
      </button>
    </p>
  ),
  // In production you would usually render nothing for these and rely on onIssue.
  unknownBlock: (block) => <p className="issue">Unknown block type “{block.type}”</p>,
  invalidBlock: (block, issues) => (
    <p className="issue">
      Block “{block.id}” has invalid content ({issues.map((i) => i.path || "root").join(", ")})
    </p>
  ),
  blockError: (block) => <p className="issue">Block “{block.id}” failed to render</p>,
};

const onIssue = (issue: CmsIssue) => {
  // Send to your logger / error tracker. Content problems never crash the page.
  if (import.meta.env.DEV) console.info("[content issue]", issue.kind, issue);
};

// What the signed-in viewer may do, e.g. from your session. UI hints only.
const capabilities = ["page:edit"];

export function App() {
  const path = usePath();
  const [locale, setLocale] = useState<"en" | "fr">("en");

  return (
    <CmsProvider
      source={source}
      blocks={blocks}
      locale={locale === "en" ? undefined : locale}
      capabilities={capabilities}
      fallbacks={fallbacks}
      onIssue={onIssue}
    >
      <header>
        <nav>
          <Link href="/">Home</Link> <Link href="/about">About</Link> <Link href="/pricing">Pricing</Link>{" "}
          <Link href="/shop">Shop</Link> <Link href="/legacy">Resilience</Link> <Link href="/missing">Missing</Link>
        </nav>
        <label>
          Locale{" "}
          <select value={locale} onChange={(e) => setLocale(e.target.value as "en" | "fr")}>
            <option value="en">English</option>
            <option value="fr">Français</option>
          </select>
        </label>
        {api && (
          <button type="button" onClick={() => api?.invalidate()}>
            Refresh content
          </button>
        )}
      </header>
      <main>{path === "/shop" ? <ShopPage /> : <CmsPage slug={path} />}</main>
    </CmsProvider>
  );
}

/** An app-owned page that embeds a CMS-managed section: the page is code, the promo is content. */
function ShopPage() {
  return (
    <section>
      <h1>Shop</h1>
      <p>This page is built in code. The promo below is a CMS section editors can change.</p>
      <aside className="promo">
        <CmsPage slug="/sections/promo" fallbacks={{ notFound: null, error: () => null }} />
      </aside>
    </section>
  );
}
