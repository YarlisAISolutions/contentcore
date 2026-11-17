"use client";
import { createMemoryStore } from "@contentcore/react";
import { ContentStudio } from "@contentcore/editor";
import { useState } from "react";
import { blocks } from "@/components/blocks";
import pages from "@/content/pages.json";

export function StudioClient() {
  const [store] = useState(() => createMemoryStore(pages));
  return <ContentStudio store={store} blocks={blocks} />;
}
