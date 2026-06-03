# PoC backend plugin (ATT-454)

A **standalone** example backend plugin. It exists to answer the review feedback
on the original spike: the first PoC lived *inside* `apps/api`, so it was
co-compiled with the host (same bundler, same `tsconfig`, same `node_modules`).
That made DI token identity true *by construction* and proved nothing about a
real plugin shipped from a separate repo with a separate build.

This package reproduces the real-world scenario:

- It is **not** part of the api's TypeScript program or Nx build. It has its own
  `package.json`, its own `tsconfig.json`, and its own bundler invocation
  (`build.mjs`, esbuild).
- It declares `@nestjs/*` and `typeorm` as **`peerDependencies`** and
  **externalizes** them at build time. They are never bundled into the artifact.
- It ships a single CommonJS artifact (`dist/index.js`) loaded by the host via
  the same `createRequire(...)` path the production loader uses
  (`apps/api/src/plugin-system/plugin.module.ts`).

## The one packaging rule

Anything the host hands you or expects to share **by class identity** must be a
`peerDependency` and externalized — never bundled:

| Package | Rule | Why |
| --- | --- | --- |
| `@nestjs/common`, `@nestjs/core` | external (peer) | DI metadata + decorators must come from the host copy |
| `@nestjs/event-emitter`, `eventemitter2` | external (peer) | `EventEmitter2` must be the *same class* as the host bus |
| `typeorm` | external (peer) | `DataSource`/`Repository` identity, single connection |
| `reflect-metadata` | external (peer) | one metadata registry per process |
| `@attraccess/plugins-backend-sdk` | may be bundled | runtime surface is a single `Symbol.for()`, identity-safe across copies |

Bundling any of the externalized packages breaks token identity even though the
code still *looks* correct — see the negative case in
`apps/api/src/plugin-system/poc/external-plugin.integration.spec.ts`.

## Typed system events

Besides the raw `context.events` bus (used here for the ping/pong PoC), the
plugin also demonstrates the **typed** event API:
`context.onEvent(SystemEvent.RESOURCE_USAGE_STARTED, ...)` with a
compile-time-checked payload. `SystemEvent` is imported as a **type only** so the
artifact keeps zero runtime dependency on the SDK; the enum value is supplied as
a string-literal cast. The subscription requires the `LISTEN_EVENTS` permission
declared in `plugin.json`.

## Build

```bash
node build.mjs   # -> dist/index.js
```

The integration test builds this package on the fly (good build + a deliberately
mis-bundled build) and loads both through the host loader to prove the rule.
