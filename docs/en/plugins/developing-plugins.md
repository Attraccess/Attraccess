# Developing Plugins

Attraccess plugins extend the platform with new API endpoints, background
behaviour, and UI pages — without forking the core. A plugin can ship a
**backend** half, a **frontend** half, or both, packaged as a single ZIP and
uploaded through the admin [Plugins](plugins/installing-plugins.md) page.

This guide is a complete walkthrough. It follows a working example —
**`plugin-hello-world`** — that exercises every core capability: a backend
controller, an injected repository, a typed event handler, and a frontend route.

> [!TIP]
> The full source is in the repository at
> [`examples/plugin-hello-world`](https://github.com/Attraccess/Attraccess/tree/main/examples/plugin-hello-world).
> Clone it, run `npm install && npm run build`, and upload the resulting ZIP to
> see it running before you write your own.

## Plugin SDKs

| SDK | Install Command | Purpose |
|-----|----------------|---------|
| `@attraccess/plugins-backend-sdk` | `npm install -D @attraccess/plugins-backend-sdk` | Backend modules, `PluginContext`, typed events, permissions |
| `@attraccess/plugins-frontend-sdk` | `npm install -D @attraccess/plugins-frontend-sdk` | Frontend plugin contract and route types |

Both SDKs are needed only at build time (types). They are not bundled into the
shipped artifact.

## Anatomy of a plugin

Every plugin is a directory with a `plugin.json` manifest at its root and one or
both build outputs:

```
my-plugin/
├── plugin.json                 # manifest (required)
├── dist/index.js               # backend entry (CommonJS) — optional
└── frontend/remoteEntry.js     # frontend entry (ESM federation remote) — optional
```

### The manifest

`plugin.json` declares the plugin's name, version, entry points, the host
versions it supports, and the permissions it needs:

```json
{
  "name": "plugin-hello-world",
  "version": "1.0.0",
  "main": {
    "backend": { "directory": "dist", "entryPoint": "index.js" },
    "frontend": { "directory": "frontend", "entryPoint": "remoteEntry.js" }
  },
  "attraccessVersion": { "min": "1.0.0" },
  "permissions": ["READ_USERS", "LISTEN_EVENTS"]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Unique identifier; also the on-disk folder name. |
| `version` | yes | Your plugin's semantic version. |
| `main.backend` / `main.frontend` | at least one | `directory` + `entryPoint`, relative to the ZIP root. |
| `attraccessVersion` | yes | Compatibility range — at least one of `min`, `max`, `exact`. |
| `permissions` | no | Backend capabilities you need (see [Permissions](#backend-plugin-permissions)). Defaults to `[]`. |

## Backend plugins

A backend plugin runs **inside** the Attraccess server process. It exports a
default `PluginBackendModule` whose `register(context)` returns a NestJS
`DynamicModule`. The host imports that module into its dependency-injection
graph, so your controllers and providers behave like first-class parts of the
API.

```ts
import type { PluginBackendModule, PluginContext, SystemEvent } from '@attraccess/plugins-backend-sdk';
import { Controller, DynamicModule, Get, Inject, Injectable, OnModuleInit } from '@nestjs/common';

// The host hands each plugin its PluginContext under this token. Recreate it
// locally (do not import the value) so the artifact has no runtime dependency on
// the SDK: Symbol.for() resolves against the process-global registry, so this is
// the exact same symbol the host uses.
const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

// SystemEvent is imported as a TYPE only (erased at build time); supply the enum
// value as a string-literal cast to keep the artifact SDK-free at runtime.
const RESOURCE_USAGE_STARTED = 'RESOURCE_USAGE_STARTED' as SystemEvent;

interface UserRow {
  id: number;
  username: string;
}

@Injectable()
class HelloWorldService implements OnModuleInit {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  onModuleInit(): void {
    // Subscribe to a typed host event. Requires the LISTEN_EVENTS permission.
    this.context.onEvent(RESOURCE_USAGE_STARTED, ({ resource, user }) => {
      this.context.logger.log(`Resource ${resource.id} usage started by user ${user.id} — hello!`);
    });
  }

  async greetUsers(): Promise<string[]> {
    // Injected repository over the shared connection. Addressing the entity by
    // NAME ('User') means we don't import the entity class; the host resolves it
    // and gates the call behind READ_USERS.
    const users = this.context.getRepository<UserRow>('User');
    const rows = await users.find({ take: 5 });
    return rows.map((row) => `Hello, ${row.username}!`);
  }
}

@Controller('hello-world')
class HelloWorldController {
  constructor(private readonly service: HelloWorldService) {}

  @Get('greetings')
  async greetings(): Promise<{ greetings: string[] }> {
    return { greetings: await this.service.greetUsers() };
  }
}

class HelloWorldPluginModule {}

const plugin: PluginBackendModule = {
  register(context: PluginContext): DynamicModule {
    return {
      module: HelloWorldPluginModule,
      controllers: [HelloWorldController],
      providers: [{ provide: PLUGIN_CONTEXT, useValue: context }, HelloWorldService],
    };
  },
};

export default plugin;
```

### The PluginContext

`register(context)` receives a `PluginContext` — your gateway to the host:

| Member | Purpose | Permission |
|--------|---------|------------|
| `context.manifest` | Your plugin's name, version, id, directory. | none |
| `context.logger` | Logger prefixed with your plugin name. | none |
| `context.getRepository(entity)` | TypeORM repository over the shared connection. | per-entity (see below) |
| `context.dataSource` | The raw shared TypeORM `DataSource`. | `DATABASE_ACCESS` |
| `context.onEvent(event, handler)` | Subscribe to a typed `SystemEvent`. | `LISTEN_EVENTS` |
| `context.emitEvent(event, payload)` | Emit a typed `SystemEvent`. | `EMIT_EVENTS` |
| `context.events` | The raw shared event bus (restricted surface). | per-method |
| `context.get(token)` | Resolve an arbitrary host provider by token. | `RESOLVE_HOST_PROVIDERS` |

> [!IMPORTANT]
> Resolve services and repositories through `context`, never by re-initialising
> TypeORM or instantiating a second `EventEmitter`. The whole point is that you
> share the host's single database connection and event bus.

### Backend plugin permissions

A backend plugin runs arbitrary code inside the host process, so every host
capability it touches must be declared up front in the manifest's `permissions`
array. At runtime the host hands your plugin a **guarded** `PluginContext`:
accessing a capability whose permission you did not declare throws a clear error
naming the missing permission.

| Permission | Grants access to |
|-----------|------------------|
| `READ_USERS` | `context.getRepository('User')` — read user accounts. |
| `ACCESS_RESOURCES` | `context.getRepository('Resource')` — read and write resources. |
| `READ_SETTINGS` | `context.getRepository('Setting')` — read application settings. |
| `DATABASE_ACCESS` | `context.dataSource` and `context.getRepository(...)` for any other entity. |
| `EMIT_EVENTS` | `context.emitEvent(...)` and `context.events.emit(...)` / `emitAsync(...)`. |
| `LISTEN_EVENTS` | `context.onEvent(...)` and `context.events.on(...)` / `once(...)` / ... |
| `RESOLVE_HOST_PROVIDERS` | `context.get(token)` — resolve arbitrary host services by token. |

A few notes on the boundary:

- `DATABASE_ACCESS` is the broad grant: it covers the raw `dataSource` and a
  repository for **any** entity, so it implicitly includes what `READ_USERS`,
  `ACCESS_RESOURCES` and `READ_SETTINGS` grant. Prefer the narrow per-entity
  permissions when you only need one of those tables.
- The event bus is exposed as a **restricted** surface. Only `emit`/`emitAsync`
  (under `EMIT_EVENTS`) and the listener methods `on`, `once`, `addListener`,
  `prependListener`, `prependOnceListener`, `many`, `prependMany`, `onAny`,
  `prependAny`, `off`, `offAny`, `removeListener`, `waitFor` (under
  `LISTEN_EVENTS`) are available. Bulk operations like `removeAllListeners` are
  not exposed.
- Declaring an unknown permission value makes the plugin fail to load.

> [!WARNING]
> Request the minimum set of permissions your plugin needs. Administrators see
> every permission a plugin requests on the Plugins page before trusting it.

### Typed system events

Alongside the raw `context.events` bus, the context exposes a **typed** seam for
the host's `SystemEvent`s with compile-time-checked payloads:

- `context.onEvent(event, handler)` — subscribe; the handler receives the typed
  payload and returns a `SystemEventSubscription` whose `off()` detaches it.
  Requires `LISTEN_EVENTS`.
- `context.emitEvent(event, payload)` — emit; the payload is type-checked against
  the event. Requires `EMIT_EVENTS`.

```ts
import { SystemEvent } from '@attraccess/plugins-backend-sdk';

const subscription = context.onEvent(SystemEvent.RESOURCE_USAGE_STARTED, ({ resource, user }) => {
  context.logger.log(`Resource ${resource.id} usage started by user ${user.id}`);
});

// later, to stop listening:
subscription.off();
```

The host emits at least `SystemEvent.RESOURCE_USAGE_STARTED` and
`SystemEvent.RESOURCE_USAGE_ENDED` when usage sessions begin and end. A handler
that throws is **isolated** by the host — its error is logged and never breaks
the core flow that emitted the event.

### Packaging the backend

A backend plugin shares the host's NestJS runtime, event bus and database
connection. For dependency-injection identities to line up, your build must use
the *same* copies of those packages the host already loaded — it must **not**
bundle its own. Split dependencies into two groups:

| Dependency | How to declare it | Why |
|-----------|-------------------|-----|
| `@nestjs/common`, `@nestjs/core`, `@nestjs/event-emitter`, `eventemitter2`, `typeorm`, `reflect-metadata` | `peerDependencies`, **externalized** at build time | They carry the DI identities, the shared event bus and the single DB connection. A bundled copy is a *different* type and silently fails to connect. |
| `@attraccess/plugins-backend-sdk` and your own code | bundle normally | Safe — the SDK's runtime surface is `Symbol.for()`, identity-safe across copies. |

Ship a **CommonJS** entry point (`index.js`), not an ES module. A minimal
[esbuild](https://esbuild.github.io/) build that follows the rule:

```bash
esbuild backend/plugin.ts \
  --bundle --platform=node --format=cjs --outfile=dist/index.js \
  --external:@nestjs/common --external:@nestjs/core \
  --external:@nestjs/event-emitter --external:eventemitter2 \
  --external:typeorm --external:reflect-metadata \
  --external:@attraccess/plugins-backend-sdk
```

> [!WARNING]
> If you bundle any of the externalized packages, your plugin may load without
> errors but quietly fail to receive events, share the database, or resolve host
> services. When in doubt, keep the list above external.

## Frontend plugins

A frontend plugin is an ES module that **default-exports a class** implementing
`AttraccessFrontendPlugin`. The host loads it at runtime as a
[Vite module federation](https://github.com/originjs/vite-plugin-federation)
*remote* (exposing `./plugin`), instantiates the class, and calls `getRoutes()`
to merge your pages into the app router.

```tsx
import type {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  RouteConfig,
} from '@attraccess/plugins-frontend-sdk';
import type { IPluginStore } from 'react-pluggable';
import { useEffect, useState } from 'react';

function HelloWorldPage() {
  const [greetings, setGreetings] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/hello-world/greetings', { credentials: 'include' })
      .then((res) => res.json())
      .then((data: { greetings: string[] }) => setGreetings(data.greetings));
  }, []);

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Hello World Plugin</h1>
      <ul>{greetings.map((g) => <li key={g}>{g}</li>)}</ul>
    </div>
  );
}

export default class HelloWorldPlugin implements AttraccessFrontendPlugin {
  getPluginName(): string {
    return 'hello-world-plugin@1.0.0';
  }
  getDependencies(): string[] {
    return [];
  }
  init(_store: IPluginStore): void {}
  activate(): void {}
  deactivate(): void {}
  onApiAuthStateChange(_authData: null | AttraccessFrontendPluginAuthData): void {}
  onApiEndpointChange(_endpoint: string): void {}

  // Contribute pages to the app router.
  getRoutes(): RouteConfig[] {
    return [{ path: '/hello-world', authRequired: true, element: <HelloWorldPage /> }];
  }
}
```

### Routes

`getRoutes()` returns an array of `RouteConfig`. Each extends React Router's
route props (`path`, `element`, ...) with an `authRequired` field:

| `authRequired` | Meaning |
|----------------|---------|
| `false` | Public route, no authentication. |
| `true` | Any logged-in user. |
| `"canManageResources"` | A single required system permission. |
| `["a", "b"]` | Any one of several required permissions. |

The host wraps each plugin route in an error boundary and merges it with the
core routes, so a route that throws cannot take down the rest of the app.

### Packaging the frontend

Build the frontend as a module federation remote exposing `./plugin`. Its
`shared` list must include every host singleton your plugin **imports at
runtime**, so it reuses the host's copy instead of bundling its own. The host
shares: `react`, `react-dom`, `react-router-dom`, `react-pluggable`,
`@heroui/react`, `@tanstack/react-query`.

```ts
// frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'plugin-hello-world',
      filename: 'remoteEntry.js',
      exposes: { './plugin': './src/plugin.tsx' },
      // Only what the plugin imports. Add @heroui/react etc. if you use them.
      shared: ['react', 'react-dom'],
    }),
  ],
  // Emit remoteEntry.js at the output root so the manifest entryPoint resolves.
  build: { target: 'esnext', minify: false, cssCodeSplit: false, assetsDir: '' },
});
```

This emits `frontend/remoteEntry.js` (plus chunks) — point your manifest's
`main.frontend.entryPoint` at it.

## Build, ZIP and upload

A combined plugin needs both halves built and zipped together. The example's
[`build.mjs`](https://github.com/Attraccess/Attraccess/blob/main/examples/plugin-hello-world/build.mjs)
does this end to end; the resulting ZIP must look like:

```
plugin-hello-world.zip
├── plugin.json                 # at the ZIP root
├── dist/index.js               # backend (CommonJS)
└── frontend/                   # frontend federation remote
    ├── remoteEntry.js
    └── ...chunks
```

> [!IMPORTANT]
> Zip the **contents**, not the containing folder — `plugin.json` must sit at the
> ZIP root: `cd package && zip -r ../plugin.zip .`

Then upload it:

1. Open the admin **Plugins** page and click **Upload Plugin**.
2. Select your ZIP. The server validates the manifest, unpacks it, and
   **restarts** to load the plugin.
3. After the restart, your backend endpoints are live and your frontend routes
   are reachable. Verify the requested permissions are listed on the Plugins
   page.

See [Installing Plugins](plugins/installing-plugins.md) for managing and removing
plugins.

## See Also

- [Plugins Overview](plugins/overview.md) — What are plugins?
- [Installing Plugins](plugins/installing-plugins.md) — Upload and manage plugins
- [Example plugin source](https://github.com/Attraccess/Attraccess/tree/main/examples/plugin-hello-world) — the `plugin-hello-world` walkthrough code
- [Developer Guide](developer/overview.md) — Attraccess architecture and development
- [API Reference](developer/api-reference.md) — Attraccess REST API
```
