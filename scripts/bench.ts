/**
 * Micro-benchmarks for the hot paths. Run: bun run bench
 * Numbers are machine-dependent; they are for spotting regressions, not marketing.
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { z } from "zod";
import { createCachedSource, createStaticSource, parsePageDocument } from "../packages/core/src";
import { CmsPage, CmsProvider, defineBlock, htmlBlock, resolveBlocksCached } from "../packages/react/src";

const hero = defineBlock({
  schema: z.object({ heading: z.string(), description: z.string().optional() }),
  component: ({ content }) => createElement("section", null, createElement("h2", null, content.heading)),
});
const registry = { hero, html: htmlBlock };

const bigPage = {
  id: "big",
  slug: "/big",
  schemaVersion: 1,
  blocks: Array.from({ length: 1000 }, (_, i) =>
    i % 2
      ? { id: `b${i}`, type: "hero", content: { heading: `Heading ${i}`, description: "Lorem ipsum" } }
      : { id: `b${i}`, type: "html", content: { nodes: [{ tag: "p", children: ["Paragraph ", { tag: "strong", children: [String(i)] }] }] } },
  ),
};

function bench(name: string, iterations: number, fn: () => unknown) {
  for (let i = 0; i < Math.min(100, iterations); i++) fn(); // warm up
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const ms = performance.now() - start;
  const per = ms / iterations;
  const rate = per < 0.001 ? `${Math.round(iterations / (ms / 1000)).toLocaleString()} ops/s` : `${per.toFixed(3)} ms/op`;
  console.log(`${name.padEnd(48)} ${rate}`);
}

async function benchAsync(name: string, iterations: number, fn: () => Promise<unknown>) {
  for (let i = 0; i < 100; i++) await fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) await fn();
  const ms = performance.now() - start;
  console.log(`${name.padEnd(48)} ${Math.round(iterations / (ms / 1000)).toLocaleString()} ops/s`);
}

const upstream = createStaticSource({ pages: [bigPage] });
const cached = createCachedSource(upstream);
await cached.getPage("/big");

bench("parsePageDocument (1,000 blocks)", 200, () => parsePageDocument(bigPage));
await benchAsync("cached getPage (hit)", 200_000, () => cached.getPage("/big"));
bench("cached peek (hit)", 1_000_000, () => cached.peek("/big"));
const page = cached.peek("/big")!;
bench("resolveBlocks, cold (1,000 blocks)", 50, () => resolveBlocksCached({ ...page }, registry));
bench("resolveBlocks, memoised", 1_000_000, () => resolveBlocksCached(page, registry));
bench("renderToString page (1,000 blocks)", 50, () =>
  renderToString(createElement(CmsProvider, { source: cached, blocks: registry }, createElement(CmsPage, { page }))),
);
