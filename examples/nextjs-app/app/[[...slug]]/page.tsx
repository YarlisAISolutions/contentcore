// Catch-all CMS route: every slug without its own Next route is a content page.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentPage } from "@/components/ContentPage";
import { getPage, slugFromParams, staticSlugs } from "@/lib/content";

type Props = { params: Promise<{ slug?: string[] }> };

// Incremental static regeneration: prerendered at build, refreshed at most every 60 s.
// For instant updates, the CMS calls /api/revalidate on publish.
export const revalidate = 60;

export function generateStaticParams() {
  return staticSlugs().map((slug) => ({ slug: slug === "/" ? [] : slug.slice(1).split("/") }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getPage(slugFromParams((await params).slug));
  if (!page) return {};
  const description = typeof page.meta?.description === "string" ? page.meta.description : undefined;
  return { title: page.title, description };
}

export default async function Page({ params }: Props) {
  const page = await getPage(slugFromParams((await params).slug));
  if (!page) notFound();
  return <ContentPage page={page} />;
}
