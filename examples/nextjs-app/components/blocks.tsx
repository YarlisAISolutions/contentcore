"use client";
// Block components are client components: they may use hooks (capabilities, prefetch) and state.
import { createHtmlBlock, defineBlock } from "@contentcore/react";
import NextLink from "next/link";
import { z } from "zod";

export const hero = defineBlock({
  schema: z.object({ heading: z.string(), description: z.string().optional() }),
  component: ({ content }) => (
    <section>
      <h1>{content.heading}</h1>
      {content.description && <p>{content.description}</p>}
    </section>
  ),
});

export const callToAction = defineBlock({
  schema: z.object({ label: z.string(), href: z.string().startsWith("/") }),
  component: ({ content }) => (
    <p>
      <NextLink href={content.href}>{content.label} →</NextLink>
    </p>
  ),
});

/** Internal links in rich content go through next/link (client navigation + prefetch). */
export const html = createHtmlBlock({
  components: {
    a: ({ href = "", ...props }: { href?: string }) =>
      href.startsWith("/") ? <NextLink href={href} {...props} /> : <a href={href} rel="noopener" {...props} />,
  },
});

export const blocks = { hero, callToAction, html };
