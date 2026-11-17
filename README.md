# ContentCore

Schema-driven content for React apps: pages made of typed blocks, loaded from any source, rendered fast and safely. Built to last: the stored format is versioned and migrates forward.

| Package | What it is |
|---|---|
| [`@contentcore/core`](packages/core) | Contracts, validation, migrations, cached and highly available sources, HTML element catalogue. No React, no runtime dependencies. |
| [`@contentcore/react`](packages/react) | `CmsProvider`, `CmsPage`, `defineBlock`, hooks, and the `html` block for every HTML, SVG and MathML element. |

Start with the [@contentcore/react README](packages/react/README.md). The design and the long-term rules are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Performance

Measured by `bun run bench` on an Apple-silicon laptop (Bun 1.4, React 19.3):

| Operation | Result |
|---|---|
| Cached `getPage` hit | ~4,000,000 ops/s |
| Cached `peek` hit | ~7,000,000 ops/s |
| Validate a 1,000-block page | ~0.06 ms |
| Resolve 1,000 blocks against schemas (cold / memoised) | ~0.13 ms / ~80M ops/s |
| `renderToString` of a 1,000-block page | ~2.3 ms |

## Develop

```bash
bun install
bun run check     # build, typecheck, tests, then verify the packed tarballs in examples/vite-app
bun run bench
```

## Licence

MIT
