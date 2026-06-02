# Backend Plugin Architecture (Design Spike — ATT-454)

> **Status:** Proposed — pending owner approval.
> **Scope:** Decides how dynamically loaded backend plugins obtain a runtime
> handle to host services (`PluginContext`), how the event bus and TypeORM
> `DataSource` are shared, whether hot enable/disable is feasible, and the
> security boundary. **Blocks Phase-3 sub-issues 2–8.**

This document is the chosen approach. The proof-of-concept is a **standalone
plugin package** (`examples/poc-backend-plugin/`) built in isolation with its own
bundler and its own `package.json` — it is *not* part of the api's TypeScript
program or Nx build. An integration test
(`apps/api/src/plugin-system/poc/external-plugin.integration.spec.ts`) builds that
package with esbuild and loads the resulting artifact through the **same
`createRequire(...)` path the production loader uses**, proving that DI token
identity, the shared event bus and the shared `DataSource` survive the
separate-build boundary — and that mis-bundling a shared dependency breaks it.

---

## 1. Problem statement

Backend plugins are loaded at bootstrap:

```ts
// apps/api/src/plugin-system/plugin.module.ts:56-72
const pluginRequire = createRequire(__filename);
const importedModule = pluginRequire(
  join(PluginService.PLUGIN_PATH, manifest.main.backend.directory, manifest.main.backend.entryPoint)
);
return importedModule.default; // a Nest DynamicModule, pushed into forRoot() imports[]
```

The plugin's default export **is** a Nest module and is imported into the host
container. But the plugin has no documented, ergonomic, type-safe way to reach:

- TypeORM repositories / `DataSource`
- `EventEmitter2` (emit + subscribe)
- `ModuleRef` (resolve arbitrary host providers)
- core domain services (settings, resources, users …)
- its own `PluginManifest` (name, version, plugin directory, id)

Today a plugin author would have to guess injection tokens and hope the plugin
bundle didn't ship its own copy of `@nestjs/*` / `typeorm` (which would break
token identity). We need a **curated, versioned facade** handed to the plugin at
load time.

### 1.1 The token-identity linchpin (and the precise condition for it)

DI in Nest is keyed by **class/symbol object identity**: `@Injectable`,
`@Inject`, `instanceof EventEmitter2`, `Repository<T>` and the provider registry
all compare *the same class object*, not its name. A plugin therefore only
integrates if the `@nestjs/*` / `typeorm` classes it references are the **exact
same objects** the host loaded.

This holds **only when both of these are true**:

1. **The plugin externalizes those packages** (declares them as
   `peerDependencies` and does *not* bundle them). A bundled copy is a different
   class object → identity breaks (proven below in §9).
2. **The plugin artifact resolves those bare imports to the host's copy.** Node
   resolves a module's `require('@nestjs/common')` starting from *the artifact's
   own directory* and walking up — **not** from the host file that required it.
   So the artifact must sit somewhere whose `node_modules` chain reaches the
   host's packages. The production loader satisfies this because plugins live in
   `PLUGIN_DIR`, nested under the running app's `node_modules` ancestry. **This is
   a real deployment constraint, not an automatic guarantee** — a plugin unpacked
   outside that chain (e.g. with its own private `node_modules`) would resolve a
   *different* `@nestjs/common` and fail. The loader should resolve/normalise
   `PLUGIN_DIR` accordingly (sub-issue 2).

The original in-app PoC could not surface this at all: being co-compiled with the
host, it shared classes *by construction*. The standalone PoC (§9) builds the
plugin separately and loads it through `createRequire`, so condition (1) is now
exercised — and its negative case fails exactly as predicted.

---

## 2. Loading model — `forRoot(context)` factory

**Decision: a curated `PluginContext` facade passed via a static
`register(context)` factory on the plugin's exported module.**

We considered three options:

| Option | Mechanism | Verdict |
| --- | --- | --- |
| **A. Factory arg** (`Module.register(ctx)`) | Host calls a static factory on the plugin's default export, passing a built `PluginContext`. | ✅ **Chosen.** Explicit, typed, testable, no global state, lets the plugin decide its own providers/controllers. |
| B. Injected provider | Publish `PLUGIN_CONTEXT` as a `@Global()` provider; plugin injects it. | Viable, but every plugin gets the *same* context — can't scope per-plugin manifest/permissions, and forces constructor injection everywhere. Kept as the **internal delivery mechanism** (see below). |
| C. Global registry | Plugin imports a singleton `PluginRegistry.get()` from the SDK. | ✗ Hidden global, hard to scope/secure, breaks if plugin bundles the SDK. |

The chosen model is **A wrapping B**: the host calls the factory, and the
factory result re-exposes the *per-plugin* context as a module-scoped provider
under the `PLUGIN_CONTEXT` token so the plugin's own services can inject it
normally.

### 2.1 The contract (shipped in the SDK)

New file `libs/plugins-backend-sdk/src/lib/plugin-context.ts` (added by this
spike, additive/non-breaking):

```ts
export const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

export interface PluginContext {
  /** This plugin's own manifest (name, version, directory, id). */
  readonly manifest: LoadedPluginManifest;

  /** Shared app event bus — same instance the host uses. */
  readonly events: EventEmitter2;

  /** Shared TypeORM connection — never re-initialised by the plugin. */
  readonly dataSource: DataSource;

  /** Typed repository accessor over the shared DataSource. */
  getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T>;

  /** Escape hatch: resolve a host provider by token (permission-gated later). */
  get<T>(token: Type<T> | string | symbol): T;

  /** Scoped logger prefixed with the plugin name. */
  readonly logger: LoggerService;
}

/** Shape every backend plugin's default export must satisfy. */
export interface PluginBackendModule {
  register(context: PluginContext): DynamicModule;
}
```

A plugin's `index` default export:

```ts
import { PluginContext, PluginBackendModule, PLUGIN_CONTEXT } from '@attraccess/plugins-backend-sdk';
import { DynamicModule, Module } from '@nestjs/common';

const MyPlugin: PluginBackendModule = {
  register(context: PluginContext): DynamicModule {
    return {
      module: class MyPluginModule {},
      controllers: [MyPluginController],
      providers: [
        { provide: PLUGIN_CONTEXT, useValue: context },
        MyPluginService,
      ],
    };
  },
};
export default MyPlugin;
```

### 2.2 Host-side wiring (the one production change sub-issue 2 implements)

The loader builds a `PluginContext` per plugin and calls `register`. Backward
compatible: if the default export has no `register`, fall back to treating it as
a plain `DynamicModule` (today's behaviour).

```ts
// proposed plugin.module.ts loader change (sub-issue 2)
const imported = pluginRequire(entryPath).default;
const moduleDef =
  typeof imported?.register === 'function'
    ? imported.register(this.buildContext(manifest))   // ← factory model
    : imported;                                          // ← legacy fallback
```

`buildContext()` is a host-only factory (`plugin-context.factory.ts`, sub-issue
2) that closes over the host's `ModuleRef`, `DataSource`, `EventEmitter2`. Because
`PluginModule` is `@Global()` and `EventEmitterModule.forRoot()` /
`TypeOrmModule.forRoot()` are imported in `AppModule`, all three are resolvable
from the host injector at the time `forRoot()` runs.

> **Bootstrap ordering caveat:** `PluginModule.forRoot()` builds the module
> graph *before* the app injector exists, so `buildContext()` cannot eagerly
> resolve `ModuleRef`/`DataSource` at graph-construction time. The context is
> therefore **lazy**: it holds a callback to the host `ModuleRef` injected into
> `PluginModule` itself, and resolves `DataSource`/services on first use
> (`onApplicationBootstrap`). The PoC test models this by constructing the
> context from an already-booted `ModuleRef`.

### 2.3 Packaging & build (the separate-repo reality)

A real plugin ships from its own repo with its own bundler. The host shares state
with it **only** through object identity (§1.1), so the build must split
dependencies into two buckets:

| Bucket | Packages | Build treatment |
| --- | --- | --- |
| **Must be `peerDependencies` + externalized** | `@nestjs/common`, `@nestjs/core`, `@nestjs/event-emitter`, `eventemitter2`, `typeorm`, `reflect-metadata` | `--external:` — never bundled. These carry DI tokens, the `EventEmitter2` class, the `DataSource`/`Repository` classes, and the single metadata registry. |
| **May be bundled** | `@attraccess/plugins-backend-sdk` | Its only runtime value is `PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context')`. `Symbol.for` uses the process-global registry, so a bundled copy yields the *same* symbol. Everything else in the SDK is types (erased). The PoC plugin imports the SDK as `import type` and recreates the symbol locally → **zero** SDK runtime dependency. |

`examples/poc-backend-plugin/build.mjs` is the reference build: one esbuild call,
CJS output, the first bucket externalized, producing a single `dist/index.js`.
This is the canonical packaging recipe for plugin authors.

### 2.4 Module format: the loader is CJS-only (manifest examples are wrong)

The production loader is **synchronous** — `createRequire(__filename)(entryPath)`
(`plugin.module.ts`). On Node 24 `require()` can load *synchronous* ESM, but not
ESM with top-level `await`, and the path is brittle. Yet the manifest examples in
`plugin.manifest.ts` advertise `entryPoint: 'index.mjs'` (ESM). **That is a
latent contradiction**: a plugin that actually ships ESM with any async init
throws `ERR_REQUIRE_ESM` at load.

**Decision for v1:** plugins ship **CommonJS** (`entryPoint: 'index.js'`, as the
PoC manifest does). Two cheap follow-ups for sub-issue 2:

- Fix the manifest examples/docs to say `index.js` (CJS) so authors are not misled.
- If ESM plugins are wanted later, switch the loader to dynamic
  `import(pathToFileURL(entryPath))` and make `loadPluginModule`/`forRoot` async.
  Contained change, but it touches the `DynamicModule` bootstrap flow, so it is
  deferred — not silently assumed to work.

---

## 3. Event access

**Decision: reuse the app's `EventEmitter2` singleton via `context.events`.**

`@nestjs/event-emitter` registers `EventEmitter2` as a global provider
(`EventEmitterModule.forRoot()` in `app.module.ts:38`). Because plugin imports
resolve against the host `node_modules`, the `EventEmitter2` class is the same
token, so `context.events` **is** the host bus.

- **Emit:** `context.events.emit(name, payload)` / `emitAsync` — identical to host
  services (`resourceUsage.service.ts:608`).
- **Subscribe:** two supported styles —
  1. **Declarative `@OnEvent`** inside a plugin provider — works automatically
     because the plugin module is part of the host graph and
     `EventEmitterModule`'s discovery scans all providers.
  2. **Imperative** `context.events.on(name, handler)` for plugins that prefer
     not to rely on the decorator/metadata.
- **Event-name contract:** the SDK already exports `SystemEvent` /
  `SystemEventPayload` (`plugin.interface.ts`). Sub-issue (events) extends this
  enum into the curated, versioned set of events plugins may rely on. Host
  internal events (e.g. `ResourceUsageEvent.EVENT_NAME`) remain emitted on the
  same bus; we document which are **public API** vs. internal.

---

## 4. DataSource / repository strategy

**Decision: share the host `DataSource`; plugins NEVER call
`TypeOrmModule.forRoot()` or `forFeature()`.**

Re-initialising TypeORM inside a plugin would open a second connection and
re-register entity metadata → duplicate-connection / metadata-conflict errors.
Instead:

- `context.dataSource` is the host's already-initialised `DataSource`.
- `context.getRepository(Entity)` ≡ `dataSource.getRepository(Entity)` — a typed
  accessor returning a standard `Repository<T>`.
- For plugins that want `@InjectRepository(Entity)` ergonomics, they may add a
  provider `{ provide: getRepositoryToken(Entity), useFactory: (ctx) => ctx.getRepository(Entity), inject: [PLUGIN_CONTEXT] }`
  inside their `register()` — documented as a recipe, no host change needed.
- **Plugin-owned entities** (tables a plugin creates): out of scope for this
  spike. Recorded as a follow-up — likely `dataSource.entityMetadatas` extension
  or a migration hook owned by a later sub-issue. The shared-DataSource model
  does not preclude it.

Packaging rule: `typeorm` and `@nestjs/typeorm` are **peerDependencies** of the
plugin (never bundled).

---

## 5. Hot enable/disable vs. restart

**Decision: stay restart-based for v1; document `ModuleRef.create()` lazy-load as
a deferred follow-up.**

Today, install/uninstall calls `process.exit()` and respawns
(`plugin.service.ts:140-156`). True hot-load is *technically* feasible:

- `ModuleRef.create(ModuleClass)` can instantiate a plugin module's providers at
  runtime without a full graph rebuild.
- **But** controllers/routes cannot be registered after the Nest HTTP adapter has
  started without re-scanning — and most plugins add controllers. Hot **unload**
  also can't reliably reclaim `@OnEvent` subscriptions, route handlers, or torn
  down DI singletons.

**Trade-off:** hot-load buys zero-downtime toggling but adds significant
lifecycle complexity (route teardown, listener cleanup, partial-failure states)
for marginal benefit in a self-hosted maker-space context where restarts are
cheap. We **defer** it to a dedicated sub-issue and keep restart-based loading,
which is simple and correct.

---

## 6. Security / isolation boundary (high level)

Feeds the permissions sub-issue.

- **Same-process trust today.** Plugins run in the host process with full DI
  reach via `context.get()`. There is no sandbox. Installing a plugin = trusting
  its code (it already runs arbitrary Node).
- **Curated facade as the seam.** `PluginContext` is the choke point. The
  `context.get()` escape hatch is where a future **capability/permission check**
  is enforced: the manifest declares requested capabilities, `buildContext()`
  wraps `get()`/`getRepository()` to deny tokens outside the granted set.
- **Manifest-declared permissions** (sub-issue): extend `PluginManifestSchema`
  (`plugin.manifest.ts`) with a `permissions[]` field; the loader passes the
  grant set into `buildContext()`.
- **Future hard isolation** (out of scope): worker-thread / separate-process
  plugins communicating over RPC. The `PluginContext` interface is transport-
  agnostic enough that a proxy implementation could back it later.

---

## 7. Versioning / compatibility

- `manifest.attraccessVersion` (`{min,max,exact}`) already gates host
  compatibility; `SemanticVersion` (SDK) does the comparison. The loader should
  reject/skip a plugin whose range excludes the running host version (sub-issue).
- **`PluginContext` is itself versioned API.** Adding fields = minor; changing/
  removing = major. The SDK package version is the contract version plugins pin.

---

## 8. How this unblocks sub-issues 2–8

| Sub-issue | Unblocked by | Named artifact |
| --- | --- | --- |
| 2 — Loader + context wiring | §2.2, §2.4, §1.1 | `plugin.module.ts` `register()` hook + `plugin-context.factory.ts` (`buildContext`), CJS entrypoint, `PLUGIN_DIR` resolution |
| 3 — Repositories / DataSource | §4 | `PluginContext.getRepository` / `.dataSource` |
| 4 — Event bus access | §3 | `PluginContext.events`, `SystemEvent` enum extension |
| 5 — Core service access | §2.1 | `PluginContext.get(token)` |
| 6 — Permissions / security | §6 | `permissions[]` in `PluginManifestSchema`, gated `get()` in `buildContext` |
| 7 — Hot enable/disable | §5 | `ModuleRef.create()` path (deferred, documented) |
| 8 — Versioning / compat gate | §7 | `attraccessVersion` check via `SemanticVersion` |

All interfaces are concrete and named, so each sub-issue starts against a fixed
contract.

---

## 9. Proof of concept (separate build, loaded across the boundary)

> The first PoC lived inside `apps/api` and was co-compiled with the host. That
> made token identity true *by construction* and proved nothing reproducible in
> the real world. This PoC replaces it with a genuinely separate build.

**The plugin** — `examples/poc-backend-plugin/`:

- Its own `package.json`, `tsconfig.json`, and bundler call (`build.mjs`,
  esbuild). It is **not** in the api's TS program or Nx build.
- Declares the host-shared packages as `peerDependencies` and externalizes them
  (§2.3); imports the SDK as `import type` only. Output is a single CJS
  `dist/index.js`.

**The test** — `apps/api/src/plugin-system/poc/external-plugin.integration.spec.ts`:

1. Builds the plugin **twice** with esbuild, writing artifacts under
   `node_modules/.cache/...` so they resolve bare imports against the host's
   `node_modules` (the §1.1 condition):
   - **good** — host-shared packages externalized;
   - **bad** — same source, but `@nestjs/event-emitter` (+ `eventemitter2`)
     deliberately bundled, simulating an author who runs a bundler with no
     externals.
2. Loads each artifact through the **production loader's exact mechanism** —
   `createRequire(__filename)(artifactPath).default` — then calls
   `register(context)` and boots a real Nest `TestingModule`
   (`EventEmitterModule.forRoot()` + sqlite `DataSource` + a host provider).
3. Drives one host→plugin→host round-trip and asserts:

| | good build | bad build |
| --- | --- | --- |
| `context.events instanceof EventEmitter2` (plugin's copy) | ✅ `true` | ❌ `false` |
| `context.dataSource instanceof DataSource` (typeorm still external) | ✅ `true` | ✅ `true` |
| repo write via shared `DataSource` + event round-trip + `context.get('HOST')` | ✅ works | ✅ works |

**What this proves.** Externalized, the separately-built plugin shares the host's
exact classes — DI, the event bus and the `DataSource` all line up across the
build boundary. Mis-bundled, `EventEmitter2` token identity silently breaks while
the *imperative* round-trip still works (because `events`/`dataSource` are passed
by value through the context). That last point is the subtle trap the §2.3
packaging rule exists to prevent, and the test makes it falsifiable.

The PoC still does **not** modify the production loader — it reuses the loader's
own `createRequire` call — so sub-issue 2 wires the one-line `register()` hook
plus the `PLUGIN_DIR` resolution constraint (§1.1) with confidence.

---

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Plugin bundles its own `@nestjs/*`/`typeorm` → token identity breaks | **Proven** in §9 (the "bad build"). Mitigated by the §2.3 packaging rule + reference `build.mjs`; loader can warn if a duplicate `DataSource`/`EventEmitter2` instance is detected. |
| Plugin unpacked outside the host's `node_modules` chain → resolves a different `@nestjs/common` | §1.1 deployment constraint; sub-issue 2 normalises `PLUGIN_DIR` under the app's resolution chain. |
| Loader is sync CJS but manifest examples say `.mjs` | §2.4 — ship CJS for v1, fix manifest examples; async `import()` path deferred. |
| Bootstrap ordering (context needs injector before graph is built) | Lazy context backed by `ModuleRef` injected into `PluginModule`; resolve on `onApplicationBootstrap`. |
| `context.get()` is an unrestricted escape hatch | Permission gate in `buildContext()` (sub-issue 6); document as privileged. |
| Restart-based UX (every toggle restarts the app) | Accepted for v1; hot-load deferred (§5). |
| Plugin-owned tables/migrations | Out of scope; flagged as follow-up (§4). |
