# CLAUDE.md: contentcore

ContentCore: schema-driven content for React. A bun monorepo with two public npm packages under the `@contentcore` org (MIT):

- `packages/core`: `@contentcore/core`. No React and no runtime dependencies, so it must stay server-safe.
- `packages/react`: `@contentcore/react`. Its build adds `"use client"`, and it re-exports core.
- `examples/*`: not workspaces. Each one consumes the packed tarballs:
  - `vite-app` runs in `verify-pack` and `verify-browsers`.
  - `nextjs-app` runs in `verify-next`.
  - `node-server` and `edge-worker` run in `verify-pack`.
- `docs/`: the user guides. Update them in the same PR as any API change.

Read `docs/ARCHITECTURE.md` before changing contracts.

## Commands

```bash
bun install
bun run check            # build → typecheck → bun test → verify-pack (publint, attw, Node/Bun/Deno, edge VM)
bun run verify:browsers  # Chromium/Firefox/WebKit via Playwright
bun run verify:next      # Next.js build + start
bun run bench
```

## Rules

- `PageDocument` is stored data. Never change its shape in place: bump `CURRENT_SCHEMA_VERSION` and add a step to `BUILTIN_MIGRATIONS`, with tests.
- Core keeps zero runtime dependencies. Validation libraries come in through Standard Schema types only.
- Pages returned by sources are deep-frozen and shared, so never mutate them.
- The HTML renderer sanitises by default, and a new element or attribute that can run script must be opt-in. Add a test for every sanitiser change.
- Keep the defaults for cache, retries and timeouts documented in `packages/react/README.md` and in sync with the code.

## Release

1. Bump the version in both `packages/*/package.json`, plus core's range in react's dependencies. Update `CHANGELOG.md`.
2. Run `bun run verify:all`, and make sure every CI job is green.
3. Publish core first, then react: `npm publish --access public` in each package directory.
   - The npm token is the contentcore org token (user `yarlis1410`).
   - Load it from Keep into the `NPM_TOKEN` env var with a temporary userconfig. Never commit an `.npmrc`.
4. Tag `v<version>` and push.
