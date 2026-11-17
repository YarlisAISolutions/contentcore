// The block registry: one entry per block `type` stored in content.
// Define it once at module scope so its identity is stable (blocks resolve once per page).
import { createHtmlBlock, defineBlock, useCapabilities, usePageDocument } from "@contentcore/react";
import { z } from "zod";
import { Link } from "./router";

/** The block from the design note, verbatim. */
export const hero = defineBlock({
  schema: z.object({
    heading: z.string(),
    description: z.string().optional(),
  }),
  component: ({ content }) => (
    <section className="hero">
      <h1>{content.heading}</h1>
      {content.description && <p>{content.description}</p>}
      <EditButton />
    </section>
  ),
});

/** Capabilities are UI hints: hide what the viewer can't do. The API still enforces permissions. */
function EditButton() {
  const { can } = useCapabilities();
  const page = usePageDocument();
  if (!can("page:edit")) return null;
  return (
    <button type="button" className="edit" onClick={() => alert(`Open the CMS editor for ${page?.id}`)}>
      Edit page
    </button>
  );
}

export const featureList = defineBlock({
  schema: z.object({
    items: z.array(z.object({ title: z.string(), body: z.string() })).min(1),
  }),
  component: ({ content }) => (
    <ul className="features">
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
    currency: z.string().length(3),
    plans: z
      .array(
        z.object({
          name: z.string(),
          price: z.number().nonnegative(),
          features: z.array(z.string()),
          highlighted: z.boolean().default(false),
        }),
      )
      .min(1),
  }),
  component: ({ content }) => {
    const format = new Intl.NumberFormat("en", { style: "currency", currency: content.currency });
    return (
      <div className="plans">
        {content.plans.map((plan) => (
          <article key={plan.name} className={plan.highlighted ? "plan highlighted" : "plan"}>
            <h3>{plan.name}</h3>
            <p className="price">{format.format(plan.price)}/mo</p>
            <ul>
              {plan.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    );
  },
});

export const callToAction = defineBlock({
  schema: z.object({ label: z.string(), href: z.string().startsWith("/") }),
  component: ({ content }) => (
    <p className="cta">
      <Link href={content.href}>{content.label} →</Link>
    </p>
  ),
});

/** Rich content: route internal <a> through the client router; everything else renders as is. */
export const html = createHtmlBlock({
  components: {
    a: ({ href, ...props }: { href?: string }) =>
      href?.startsWith("/") ? <Link href={href} {...props} /> : <a href={href} {...props} />,
  },
});

export const blocks = { hero, featureList, pricingTable, callToAction, html };
