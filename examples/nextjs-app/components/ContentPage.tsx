"use client";
// The client boundary: receives a page loaded on the server and renders it with the block registry.
import { type CmsFallbacks, CmsPage, CmsProvider, type PageDocument, createApiSource } from "@contentcore/react";
import { useState } from "react";
import { blocks } from "./blocks";

// Browser-side source (used by anything that loads on the client, e.g. <CmsPage slug>):
// it reads this app's own content API route.
const browserSource = typeof window === "undefined" ? undefined : createApiSource({ baseUrl: "/api/content" });

const fallbacks: CmsFallbacks = {
  unknownBlock: () => null,
  invalidBlock: () => null,
  blockError: () => null,
};

export function ContentPage({ page }: { page: PageDocument }) {
  // Hand the server-loaded page to the browser cache, so client navigation back to it is instant.
  useState(() => browserSource?.prime(page));
  return (
    <CmsProvider source={browserSource ?? noSource} blocks={blocks} fallbacks={fallbacks}>
      <CmsPage page={page} />
    </CmsProvider>
  );
}

// During server rendering, pages arrive as props, so no source is needed.
const noSource = { getPage: async () => null };
