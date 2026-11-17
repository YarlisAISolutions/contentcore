import {
  CmsPage,
  CmsProvider,
  createApiSource,
  createStaticSource,
  defineBlock,
  useCapabilities,
} from "@contentcore/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import pages from "./content/pages.json";

const hero = defineBlock({
  schema: z.object({
    heading: z.string(),
    description: z.string().optional(),
  }),
  component: ({ content }) => {
    const { can } = useCapabilities();
    return (
      <section>
        <h1>{content.heading}</h1>
        <p>{content.description}</p>
        {can("page:edit") && <button type="button">Edit page</button>}
      </section>
    );
  },
});

const featureList = defineBlock({
  schema: z.object({
    items: z.array(z.object({ title: z.string(), body: z.string() })).min(1),
  }),
  component: ({ content }) => (
    <ul>
      {content.items.map((item) => (
        <li key={item.title}>
          <strong>{item.title}</strong> {item.body}
        </li>
      ))}
    </ul>
  ),
});

// Swap sources without touching any component: set VITE_CONTENT_API to use your backend.
const api = import.meta.env.VITE_CONTENT_API as string | undefined;
const source = api ? createApiSource({ baseUrl: api }) : createStaticSource({ pages });
const blocks = { hero, featureList };

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CmsProvider
      source={source}
      blocks={blocks}
      fallbacks={{
        loading: <p>Loading…</p>,
        notFound: (slug) => <p>No page at {slug}</p>,
        error: (_error, retry) => (
          <p>
            Could not load this page. <button type="button" onClick={retry}>Try again</button>
          </p>
        ),
      }}
    >
      <CmsPage slug={window.location.pathname} />
    </CmsProvider>
  </StrictMode>,
);
