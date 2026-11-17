// An app-owned page that embeds a CMS-managed section. The page is code; the promo is content.
import { ContentPage } from "@/components/ContentPage";
import { getPage } from "@/lib/content";

export const revalidate = 60;

export default async function ShopPage() {
  // Load on the server like any other data. A missing section renders nothing instead of failing the page.
  const promo = await getPage("/sections/promo").catch(() => null);
  return (
    <section>
      <h1>Shop</h1>
      <p>This page is built in code. The promo below is a CMS section editors can change.</p>
      {promo && (
        <aside>
          <ContentPage page={promo} />
        </aside>
      )}
    </section>
  );
}
