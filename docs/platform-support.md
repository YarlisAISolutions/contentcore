# Platform support

Every row marked **CI** runs on every pull request. "Pattern" rows are documented integrations whose underlying pieces are tested, but which have no dedicated CI job.

## Operating systems and runtimes

| Platform | Versions | Status | How it is verified |
|---|---|---|---|
| Linux | ubuntu-latest | **CI** | Unit tests, packed-tarball checks, Node/Bun smoke tests |
| macOS | macos-latest (Apple silicon) | **CI** | Same |
| Windows | windows-latest | **CI** | Same |
| Node.js | 20, 22, 24 | **CI** | ESM and CommonJS imports, server render, `examples/node-server` (API + SSR) on each OS |
| Bun | 1.4 | **CI** | Unit tests, imports, `examples/node-server` |
| Deno | 2.x | **CI** | ESM imports, server render, `examples/node-server` through `node:http` compatibility |
| Edge runtimes (Cloudflare Workers, Vercel Edge, Deno Deploy, Netlify Edge) | n/a | **CI** (edge VM) | `examples/edge-worker` bundled with edge conditions and run in `@edge-runtime/vm`: streaming render, cache hits, 404s |
| React Native (Hermes) | n/a | Not run | Core has fallbacks for missing Hermes globals; the `html` block is DOM-only ([details](embedding.md#react-native)) |

## Browsers

| Engine | Status | How it is verified |
|---|---|---|
| Chromium (Chrome, Edge, Opera, Brave) | **CI** | Playwright drives `examples/vite-app`: rendering, SVG/MathML, sanitisation, client navigation, embedded sections, locales, fallbacks, editable form fields |
| Firefox | **CI** | Same |
| WebKit (Safari, all iOS browsers) | **CI** | Same |

**Baseline:** Safari 15+, Chrome/Edge 90+, Firefox 90+ (ES2020, `fetch`, `AbortController` with `signal.reason`, `Error` `cause`). Newer APIs (`AbortSignal.any`, `AbortSignal.timeout`, `structuredClone`, `DOMException` and `Object.hasOwn`) are feature-detected with fallbacks. Only current engine versions run in CI, so older versions in the baseline are supported by design but not tested.

## React and frameworks

| | Status | How it is verified |
|---|---|---|
| React 19 | **CI** | Full unit suite |
| React 18.3 | **CI** | Full unit suite on React 18 |
| Next.js 16, App Router (RSC + client components, ISR, route handlers) | **CI** | `examples/nextjs-app`: `next build` + `next start`, prerendered pages, metadata, embedded section, 404, content API with ETag, webhook auth |
| Vite | **CI** | `examples/vite-app` type-checks and builds from the packed tarballs |
| Next.js Pages Router, React Router / Remix, Astro, Express / Fastify / Hono | Pattern | [Embedding guide](embedding.md) |

## Packaging

| | Status |
|---|---|
| ESM + CommonJS builds, type declarations for both (`.d.ts` / `.d.cts`) | **CI** (`publint --strict`, `@arethetypeswrong/cli`) |
| `"use client"` directive on `@contentcore/react`; `@contentcore/core` has no directive and is server-safe | **CI** (Next.js build) |
| Zero runtime dependencies in `@contentcore/core` | By design |
| Tree-shakeable (`sideEffects: false`) | By design |

## Running the checks locally

```bash
bun install
bun run check              # build, typecheck, tests, packed tarballs on Node/Bun/Deno + edge VM
bun run verify:browsers    # Chromium, Firefox, WebKit (downloads browsers on first run)
bun run verify:next        # Next.js build + start
bun run verify:all         # everything
```
