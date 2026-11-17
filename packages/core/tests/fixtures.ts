export const homePage = {
  id: "home",
  slug: "/",
  schemaVersion: 1,
  blocks: [
    {
      id: "welcome",
      type: "hero",
      content: { heading: "Welcome", description: "Explore our products" },
    },
  ],
};

export const aboutPage = {
  id: "about",
  slug: "/about",
  schemaVersion: 1,
  title: "About",
  capabilities: ["page:edit"],
  blocks: [{ id: "intro", type: "hero", content: { heading: "About us" } }],
};

export const aboutPageFr = {
  ...aboutPage,
  id: "about-fr",
  locale: "fr",
  blocks: [{ id: "intro", type: "hero", content: { heading: "À propos" } }],
};
