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
| `main.migrations` | no | `directory` + `entryPoint` of a module exporting TypeORM migration classes. See [Database Migrations](plugins/database-migrations.md). |
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
| `context.getMqttServerConfig(serverId)` | Resolve an MQTT server's connection config + resolved (decrypted) credentials. | `ACCESS_MQTT_SERVERS` |

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
| `ACCESS_MQTT_SERVERS` | `context.getMqttServerConfig(serverId)` — read an MQTT server's connection config and resolved credentials. |

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

> [!TIP]
> **Recommended: build your UI with the host's own libraries.** The host shares
> its component kit [`@heroui/react`](https://www.heroui.com/) and its icon set
> [`lucide-react`](https://lucide.dev/) over module federation (see
> [Packaging the frontend](#packaging-the-frontend)). Import them instead of
> hand-rolling styles and your pages look native, stay consistent, and inherit
> the host's **light/dark theme automatically** — HeroUI components read the
> active theme from the host, and Tailwind utility classes (`text-default-500`,
> `border-default-200`, …) resolve against the host's stylesheet because your
> page renders inside the host DOM. Because these packages are *shared*, the
> host serves its single copy at runtime, so your plugin bundle only carries its
> own code.

```tsx
import { Card, Chip, Spinner } from '@heroui/react';
import { HandIcon } from 'lucide-react';
import type {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  RouteConfig,
} from '@attraccess/plugins-frontend-sdk';
import type { IPluginStore } from 'react-pluggable';
import { useEffect, useState } from 'react';

function HelloWorldPage() {
  const [greetings, setGreetings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/hello-world/greetings', { credentials: 'include' })
      .then((res) => res.json())
      .then((data: { greetings: string[] }) => setGreetings(data.greetings))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <HandIcon className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-semibold text-default-800">Hello World Plugin</h1>
      </div>
      <Card className="border border-default-200 dark:border-default-100">
        <Card.Content>
          {loading ? (
            <Spinner size="sm" />
          ) : (
            <ul className="flex flex-col gap-2">
              {greetings.map((g) => (
                <li key={g}>
                  <Chip color="accent" variant="soft">{g}</Chip>
                </li>
              ))}
            </ul>
          )}
        </Card.Content>
      </Card>
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

### Slots (embedded extension points)

Routes give a plugin its own pages. **Slots** let a plugin inject UI *into* a
host page at a well-known point, without the host knowing anything about the
plugin. A slot is identified by a string id the host documents (just like a
route `path`), and the host hands each contribution a small context object
describing where it is mounted.

Implement `getSlotContributions()` and return one entry per slot you target:

```tsx
// Type each contribution against the context the host documents for the slot,
// so `context` is strongly typed with no runtime casting.
interface MqttServerSlotContext { mqttServerId: number; [key: string]: unknown; }

getSlotContributions(): PluginSlotContribution[] {
  const contributions: PluginSlotContribution<MqttServerSlotContext>[] = [
    {
      slotId: 'mqtt.server.detail',           // host-documented id
      key: 'my-plugin-mqtt-detail',           // stable key (optional)
      render: (context) => <MyPanel mqttServerId={context.mqttServerId} />,
    },
  ];
  return contributions;
}
```

- `slotId` — the host extension point to render into. Unknown ids are ignored.
- `render(context)` — returns the React node to embed. `context` is a plain
  object whose keys the host documents per slot (e.g. the MQTT slots pass
  `{ mqttServerId }`), so a contribution can scope itself to the right entity.
  `PluginSlotContribution<Context>` is generic over that shape, so you type it
  once and skip per-field casts; contributions for different slots still share
  one `PluginSlotContribution[]` array.
- The `key` is optional but doubles as the contribution's id in host error logs.
- The host renders every matching contribution inside an error boundary, so a
  throwing contribution is hidden and logged rather than breaking the host page.

The slot contract is intentionally generic — the SDK carries no domain
knowledge. Host slot ids available today:

| Slot id | Where it renders | Context |
|---------|------------------|---------|
| `mqtt.server.detail` | MQTT server detail/edit view (extensions section) | `{ mqttServerId }` |
| `mqtt.server.list.row` | MQTT server list, per-row action area | `{ mqttServerId }` |

### Packaging the frontend

Build the frontend as a module federation remote exposing `./plugin`. Its
`shared` list must include every host singleton your plugin **imports at
runtime**, so it reuses the host's copy instead of bundling its own. The host
shares: `react`, `react-dom`, `react-router-dom`, `react-pluggable`,
`@heroui/react`, `lucide-react`, `@tanstack/react-query`.

> [!TIP]
> List `@heroui/react` and `lucide-react` here when you follow the recommended
> approach above. They are large libraries — sharing them keeps your plugin
> bundle small (the host serves its copy) and guarantees a single, themed
> instance of the component kit.

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
      // Every host singleton the plugin imports at runtime. @heroui/react and
      // lucide-react are listed here because the recommended UI uses them.
      shared: ['react', 'react-dom', 'react-router-dom', '@heroui/react', 'lucide-react'],
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

## First-party plugins (nx apps in this repo)

Third-party plugins are standalone packages built with their own `build.mjs`
(see [`examples/plugin-hello-world`](https://github.com/Attraccess/Attraccess/tree/main/examples/plugin-hello-world)).
Plugins maintained **inside this monorepo** are instead first-class **nx apps**,
so they share the workspace toolchain, caching and CI.

**Convention:**

- **Location:** one directory per plugin under `apps/plugins/<name>/`, with the
  same anatomy as any plugin (`plugin.json`, `backend/plugin.ts`,
  `frontend/src/plugin.tsx`, …).
- **nx tag:** every plugin app is tagged **`type:plugin`** in its `project.json`.
  CI targets the set with `--projects=tag:type:plugin` (build + zip the plugins)
  and the generic lint/typecheck/test/build jobs exclude it with
  `--exclude=...,tag:type:plugin`, exactly mirroring how `scope:hardware` is
  handled. List the plugin apps any time with:

  ```bash
  pnpm nx show projects --projects=tag:type:plugin
  ```

- **Build recipe:** the esbuild/Vite/zip recipe described above is shared across
  plugin apps via `apps/plugins/scripts/` (`esbuild-backend.mjs`,
  `vite-federation.config.mjs`, `zip-plugin.mjs`). Each plugin's `project.json`
  wires them into nx targets:

  | Target | Produces |
  |--------|----------|
  | `build-backend` | `package/dist/index.js` (esbuild, CommonJS, host packages externalized) |
  | `build-frontend` | `package/frontend/remoteEntry.js` (Vite federation remote) |
  | `build` | copies `plugin.json` into `package/` (depends on the two builds) |
  | `package` | `dist/plugin-<name>.zip` — the uploadable artifact (depends on `build`) |

  ```bash
  # Build and zip a single plugin app:
  pnpm nx package plugin-rabbitmq
  # …or every plugin app at once:
  pnpm nx run-many --target=package --projects=tag:type:plugin
  ```

- **CI:** pull-request builds zip all `tag:type:plugin` apps, upload the ZIPs as
  workflow artifacts, and post a sticky PR comment listing them. Releases attach
  the same ZIPs as release assets.

## See Also

- [Plugins Overview](plugins/overview.md) — What are plugins?
- [Installing Plugins](plugins/installing-plugins.md) — Upload and manage plugins
- [Example plugin source](https://github.com/Attraccess/Attraccess/tree/main/examples/plugin-hello-world) — the `plugin-hello-world` walkthrough code
- [Developer Guide](developer/overview.md) — Attraccess architecture and development
- [API Reference](developer/api-reference.md) — Attraccess REST API
```
