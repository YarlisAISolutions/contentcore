// The same block registry the website renders with. The studio uses it for "Add block",
// generated forms (from each schema's JSON Schema), validation and the live preview.
import { createHtmlBlock, defineBlock } from "@contentcore/react";
import { z } from "zod";

export const hero = defineBlock({
  schema: z.object({
    heading: z.string().min(1, "A heading is required").describe("The main title"),
    description: z.string().optional().describe("One or two sentences under the title"),
  }),
  component: ({ content }) => (
    <section>
      <h1>{content.heading}</h1>
      {content.description && <p>{content.description}</p>}
    </section>
  ),
});

export const featureList = defineBlock({
  schema: z.object({
    items: z.array(z.object({ title: z.string().min(1), body: z.string() })).min(1, "Add at least one feature"),
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

export const pricingTable = defineBlock({
  schema: z.object({
    currency: z.enum(["USD", "EUR", "GBP"]),
    plans: z
      .array(
        z.object({
          name: z.string().min(1),
          price: z.number().nonnegative(),
          features: z.array(z.string()),
          highlighted: z.boolean().default(false),
        }),
      )
      .min(1),
  }),
  component: ({ content }) => (
    <div style={{ display: "flex", gap: 12 }}>
      {content.plans.map((plan) => (
        <article key={plan.name} style={{ border: `1px solid ${plan.highlighted ? "#4f46e5" : "#ccc"}`, padding: 12, borderRadius: 8 }}>
          <h3>{plan.name}</h3>
          <p>
            {plan.price} {content.currency}/mo
          </p>
          <ul>
            {plan.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  ),
});

export const callToAction = defineBlock({
  schema: z.object({ label: z.string().min(1), href: z.string().startsWith("/", "Use an internal path such as /pricing") }),
  component: ({ content }) => (
    <p>
      <a href={content.href}>{content.label} →</a>
    </p>
  ),
});

export const blocks = { hero, featureList, pricingTable, callToAction, html: createHtmlBlock() };
