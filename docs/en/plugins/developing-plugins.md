# Developing Plugins

Attraccess plugins extend the platform with new API endpoints, background
behaviour, and UI pages — without forking the core. A plugin can ship a
**backend** half, a **frontend** half, or both, published as an npm package and
installed through the admin [Plugins](plugins/installing-plugins.md) page.

## Official plugin classification

Plugin packages are Community by default. Attraccess marks a package Official only when its exact npm package name and registry source are listed in the core-owned allowlist at `apps/api/src/plugin-system/plugin-classification.service.ts`. Package metadata cannot grant this label.

To add or remove an Official package, update that allowlist in a normal pull request. The review must confirm the exact registry host, package identity, and expected registry publisher when that metadata is available. Include tests for the approved source and for the same name from another registry. Official means maintained or approved by Attraccess; it does not imply a security sandbox or guarantee of safety. Installers must still review the source and requested permissions.

This guide is a complete walkthrough. It follows a working example —
**`plugin-hello-world`** — that exercises every core capability: a backend
controller, an injected repository, a typed event handler, and a frontend route.

> [!TIP]
> The full source is in the repository at
> [`examples/plugin-hello-world`](https://github.com/Attraccess/Attraccess/tree/main/examples/plugin-hello-world).
> Clone it, run `npm install && npm run build && npm pack ./package`, and use
> the resulting npm tarball to see it running before you write your own.

## Plugin SDKs

| SDK                                | Install Command                                   | Purpose                                                     |
| ---------------------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| `@attraccess/plugins-backend-sdk`  | `npm install -D @attraccess/plugins-backend-sdk`  | Backend modules, `PluginContext`, typed events, permissions |
| `@attraccess/plugins-frontend-sdk` | `npm install -D @attraccess/plugins-frontend-sdk` | Frontend plugin contract and route types                    |

Both SDKs are needed only at build time (types). They are not bundled into the
shipped artifact.

## Anatomy of a plugin

Every npm plugin has a `package.json` at its root and one or
both build outputs:

```
my-plugin/
├── package.json                # npm and Attraccess metadata (required)
├── dist/index.js               # backend entry (CommonJS) — optional
└── frontend/remoteEntry.js     # frontend entry (ESM federation remote) — optional
```

### Package metadata

`package.json` declares the plugin's identity, version, entry points, host
versions, SDK peers, and permissions. It must include the `attraccess-plugin`
keyword and an `attraccess` object:

```json
{
  "name": "@example/plugin-hello-world",
  "version": "1.0.0",
  "keywords": ["attraccess-plugin"],
  "peerDependencies": {
    "@attraccess/plugins-backend-sdk": "^1.9.0",
    "@attraccess/plugins-frontend-sdk": "^1.9.0"
  },
  "attraccess": {
    "displayName": "Hello World",
    "host": "^1.9.0",
    "backend": "dist/index.js",
    "frontend": "frontend/remoteEntry.js",
    "styles": "frontend/style.css",
    "permissions": ["READ_USERS", "LISTEN_EVENTS"],
    "sdk": { "backend": "^1.9.0", "frontend": "^1.9.0" }
  }
}
```

| Field                                        | Required     | Notes                                                                                                  |
| -------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------ |
| `name`                                       | yes          | Immutable npm package identifier.                                                                      |
| `version`                                    | yes          | Your plugin's semantic version.                                                                        |
| `attraccess.backend` / `attraccess.frontend` | at least one | Relative package entry point.                                                                          |
| `attraccess.styles`                          | no           | Stylesheet alongside the frontend entry point.                                                         |
| `attraccess.migrations`                      | no           | Module exporting TypeORM migration classes. See [Database Migrations](plugins/database-migrations.md). |
| `attraccess.host`                            | yes          | Compatible Attraccess host semver range.                                                               |
| `attraccess.permissions`                     | no           | Backend capabilities you need (see [Permissions](#backend-plugin-permissions)). Defaults to `[]`.      |

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

| Member                                                    | Purpose                                                                        | Permission               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------ |
| `context.manifest`                                        | Your plugin's name, version, id, directory.                                    | none                     |
| `context.logger`                                          | Logger prefixed with your plugin name.                                         | none                     |
| `context.getRepository(entity)`                           | TypeORM repository over the shared connection.                                 | per-entity (see below)   |
| `context.dataSource`                                      | The raw shared TypeORM `DataSource`.                                           | `DATABASE_ACCESS`        |
| `context.onEvent(event, handler)`                         | Subscribe to a typed `SystemEvent`.                                            | `LISTEN_EVENTS`          |
| `context.emitEvent(event, payload)`                       | Emit a typed `SystemEvent`.                                                    | `EMIT_EVENTS`            |
| `context.events`                                          | The raw shared event bus (restricted surface).                                 | per-method               |
| `context.get(token)`                                      | Resolve an arbitrary host provider by token.                                   | `RESOLVE_HOST_PROVIDERS` |
| `context.getMqttServerConfig(serverId)`                   | Resolve an MQTT server's connection config + resolved (decrypted) credentials. | `ACCESS_MQTT_SERVERS`    |
| `context.mqtt.subscribe(serverId, topicFilter, handler)`  | Subscribe through the host's shared MQTT connection; resolves after broker acknowledgement. | `ACCESS_MQTT_SERVERS`    |
| `context.mqtt.publish(serverId, topic, payload, options)` | Publish through the host's shared MQTT connection.                             | `ACCESS_MQTT_SERVERS`    |

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

| Permission               | Grants access to                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `READ_USERS`             | `context.getRepository('User')` — read user accounts.                                                                                                                 |
| `ACCESS_RESOURCES`       | `context.getRepository('Resource')` — read and write resources.                                                                                                       |
| `READ_SETTINGS`          | `context.getRepository('Setting')` — read application settings.                                                                                                       |
| `DATABASE_ACCESS`        | `context.dataSource` and `context.getRepository(...)` for any other entity.                                                                                           |
| `EMIT_EVENTS`            | `context.emitEvent(...)` and `context.events.emit(...)` / `emitAsync(...)`.                                                                                           |
| `LISTEN_EVENTS`          | `context.onEvent(...)` and `context.events.on(...)` / `once(...)` / ...                                                                                               |
| `RESOLVE_HOST_PROVIDERS` | `context.get(token)` — resolve arbitrary host services by token.                                                                                                      |
| `ACCESS_MQTT_SERVERS`    | `context.getMqttServerConfig(serverId)`, `context.mqtt.subscribe(...)`, and `context.mqtt.publish(...)` — access an MQTT server through the host's pooled connection. |

### MQTT subscriptions

Use `context.mqtt` rather than creating your own MQTT client. The host manages
the broker connection, reconnects, and broker subscriptions. Topic filters
support MQTT `+` and `#` wildcards. The handler receives the raw payload as a
`Buffer`; retained messages are delivered by the broker when it accepts the
subscription.

```ts
const subscription = await context.mqtt.subscribe(1, 'devices/+/state', ({ topic, payload }) => {
  context.logger.log(`${topic}: ${payload.toString()}`);
});

await context.mqtt.publish(1, 'devices/kitchen/set', '{"on":true}', { qos: 1 });
subscription.unsubscribe();
```

Handlers are isolated: an exception is logged with the plugin scope and does
not interrupt MQTT delivery to other plugins. All remaining subscriptions are
also removed automatically when the plugin module is destroyed.

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
the _same_ copies of those packages the host already loaded — it must **not**
bundle its own. Split dependencies into two groups:

| Dependency                                                                                                | How to declare it                                  | Why                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nestjs/common`, `@nestjs/core`, `@nestjs/event-emitter`, `eventemitter2`, `typeorm`, `reflect-metadata` | `peerDependencies`, **externalized** at build time | They carry the DI identities, the shared event bus and the single DB connection. A bundled copy is a _different_ type and silently fails to connect. |
| `@attraccess/plugins-backend-sdk` and your own code                                                       | bundle normally                                    | Safe — the SDK's runtime surface is `Symbol.for()`, identity-safe across copies.                                                                     |

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
_remote_ (exposing `./plugin`), instantiates the class, and calls `getRoutes()`
to merge your pages into the app router.

> [!TIP]
> **Recommended: build your UI with the host's own libraries.** The host shares
> its component kit [`@heroui/react`](https://www.heroui.com/) and its icon set
> [`lucide-react`](https://lucide.dev/) over module federation (see
> [Packaging the frontend](#packaging-the-frontend)). Import them instead of
> hand-rolling styles and your pages look native, stay consistent, and inherit
> the host's **light/dark theme automatically** — HeroUI components read the
> active theme from the host because your page renders inside the host DOM.
> Because these packages are _shared_, the host serves its single copy at
> runtime, so your plugin bundle only carries its own code.
>
> Raw Tailwind utility classes (`flex`, `gap-6`, `text-default-500`, …) are
> **not** covered by the host stylesheet — the host only ships the classes _it_
> uses. Bundle your own prefixed utilities as described in
> [Styling](#styling-bundle-your-own-css).

```tsx
import { Card, Chip, Spinner } from '@heroui/react';
import { HandIcon } from 'lucide-react';
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import type {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  RouteConfig,
} from '@attraccess/plugins-frontend-sdk';
import type { IPluginStore } from 'react-pluggable';
import { useEffect, useState } from 'react';

const api = createPluginApiClient('/api/hello-world');

function HelloWorldPage() {
  const [greetings, setGreetings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .request<{ greetings: string[] }>('/greetings')
      .then((data) => setGreetings(data.greetings))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="hw:flex hw:flex-col hw:gap-6 hw:p-6 hw:max-w-4xl hw:mx-auto">
      <div className="hw:flex hw:items-center hw:gap-3">
        <HandIcon className="hw:w-6 hw:h-6 hw:text-primary" />
        <h1 className="hw:text-2xl hw:font-semibold hw:text-default-800">Hello World Plugin</h1>
      </div>
      <Card className="hw:border hw:border-default-200 hw:dark:border-default-100">
        <Card.Content>
          {loading ? (
            <Spinner size="sm" />
          ) : (
            <ul className="hw:flex hw:flex-col hw:gap-2">
              {greetings.map((g) => (
                <li key={g}>
                  <Chip color="accent" variant="soft">
                    {g}
                  </Chip>
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

### Calling the API

Do **not** hand-roll a fetch wrapper. The SDK ships a preconfigured client —
`createPluginApiClient(basePath?)` — that already knows the host's API origin,
sends the session cookie, serialises JSON, and turns a failed response into an
error carrying the backend's message:

```ts
import { createPluginApiClient, PluginApiError } from '@attraccess/plugins-frontend-sdk';

// Your backend routes are mounted under `/api/<plugin-name>`.
const api = createPluginApiClient('/api/hello-world');

await api.request<Greeting[]>('/greetings'); // GET, parsed JSON
await api.request<Greeting>('/greetings', { method: 'POST', body: { text } }); // JSON body
await api.request<void>('/greetings/1', { method: 'DELETE' }); // empty body → null
await api.request<Result>('/detection/7', { query: { refresh: true } }); // query string
```

| Member                       | Purpose                                                                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request<T>(path, options?)` | JSON in, JSON out. `options` takes any `RequestInit` field plus `body` (serialised automatically) and `query`. Throws `PluginApiError` (with `.status`) on a non-2xx response; an empty body resolves to `null`. |
| `fetch(path, init?)`         | Escape hatch for non-JSON responses (downloads, streams). Still resolves the base URL and sends credentials.                                                                                                     |
| `url(path, query?)`          | The absolute URL, e.g. for an `<a href>` or an `EventSource`.                                                                                                                                                    |

Omit `basePath` to address the host API directly (`api.request('/api/users/me')`).

### Routes

`getRoutes()` returns an array of `RouteConfig`. Each extends React Router's
route props (`path`, `element`, ...) with an `authRequired` field:

| `authRequired`                             | Meaning                                  |
| ------------------------------------------ | ---------------------------------------- |
| `false`                                    | Public route, no authentication.         |
| `true`                                     | Any logged-in user.                      |
| `"resources.update"`                       | A single required RBAC permission key.   |
| `["resources.update", "resources.create"]` | Any one of several RBAC permission keys. |

See [Permissions](../user-management/permissions.md) for the full list of available permission keys.

The host wraps each plugin route in an error boundary and merges it with the
core routes, so a route that throws cannot take down the rest of the app.

### Slots (embedded extension points)

Routes give a plugin its own pages. **Slots** let a plugin inject UI _into_ a
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

| Slot id                | Where it renders                                  | Context            |
| ---------------------- | ------------------------------------------------- | ------------------ |
| `mqtt.server.detail`   | MQTT server detail/edit view (extensions section) | `{ mqttServerId }` |
| `mqtt.server.list.row` | MQTT server list, per-row action area             | `{ mqttServerId }` |

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
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // compiles src/styles.css — see "Styling" below
    federation({
      name: 'plugin-hello-world',
      filename: 'remoteEntry.js',
      exposes: { './plugin': './src/plugin.tsx' },
      // Every host singleton the plugin imports at runtime. @heroui/react and
      // lucide-react are listed here because the recommended UI uses them.
      shared: ['react', 'react-dom', 'react-router-dom', '@heroui/react', 'lucide-react'],
    }),
  ],
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
    // Emit remoteEntry.js and style.css at the output root, un-hashed, so the
    // manifest's entryPoint and styles fields resolve.
    assetsDir: '',
    rollupOptions: { output: { assetFileNames: '[name][extname]' } },
  },
});
```

This emits `frontend/remoteEntry.js` (plus chunks) — point your manifest's
`main.frontend.entryPoint` at it.

### Styling: bundle your own CSS

Your plugin renders inside the host DOM, but the host's stylesheet only
contains the Tailwind utility classes used by the _host's own_ sources. Any
class your plugin uses beyond that set would silently render unstyled — so
every plugin bundles its own CSS and declares it in the manifest via
`main.frontend.styles`. The host then injects it as a `<link>` when it loads
your plugin.

Your utilities must be **prefixed** (pick a short unique prefix, e.g. your
plugin's initials). Two complete, unprefixed Tailwind builds in one document
break each other: your `.fixed` rule would defeat the host's responsive
`md:relative`, and the host's `.p-4` your `md:p-6`, because cascade-layer
priority beats source order across stylesheets. DOM-scoping is no alternative
either — HeroUI drawers and modals portal to `<body>`, outside any wrapper
element. Prefixed class names travel with your markup, so they work everywhere
(portals included) and can never collide with host classes in either
direction.

With Tailwind (`@tailwindcss/vite`, shown in the config above), create
`src/styles.css` and import it from your `plugin.tsx`:

```css
/* Emit ONLY the utilities used by this plugin's sources, under your prefix —
   no preflight, since the host document already provides it. Theme tokens are
   emitted as --hw-* variables, so they don't clash with the host's. The HeroUI
   token map is `@theme inline` and referenced, so utilities like
   `hw:bg-surface` compile straight to the host-defined CSS variables. */
@import 'tailwindcss/theme.css' prefix(hw);
@import '@heroui/styles/themes/shared/theme.css' theme(reference);
@import 'tailwindcss/utilities.css' source(none);
@source './';

/* Must match the host's dark-mode variant. */
@custom-variant dark (&:where(.dark, .dark *));
```

Then write every utility class with the prefix — it goes first, before
variants:

```tsx
<div className="hw:flex hw:flex-col hw:gap-6 hw:p-4 hw:md:p-6">
  <h1 className="hw:text-2xl hw:font-semibold hw:dark:text-default-800">…</h1>
</div>
```

With `cssCodeSplit: false` and the `assetFileNames` shown above, the build
emits a single `frontend/style.css` — point `main.frontend.styles` at it.
HeroUI _components_ need none of this (they are styled by the host), only the
utility classes in your own markup do.

## Build, pack, and install

A combined plugin needs both halves built into an npm package. The example's
[`build.mjs`](https://github.com/Attraccess/Attraccess/blob/main/examples/plugin-hello-world/build.mjs)
does this end to end; the package contents must look like:

```
package/
├── package.json                # npm and Attraccess metadata
├── dist/index.js               # backend (CommonJS)
└── frontend/                   # frontend federation remote
    ├── remoteEntry.js
    ├── style.css               # plugin-bundled CSS (main.frontend.styles)
    └── ...chunks
```

> [!IMPORTANT]
> [!IMPORTANT]
> Run `npm pack ./package` and distribute the resulting `.tgz` file. Package
> lifecycle scripts are not run by Attraccess during installation.

Then install it:

1. Publish the package to an npm-compatible registry.
2. Open **Settings** > **Plugins**, select the registry package and version.
   The server validates its package metadata, downloads and unpacks it, and
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
  same anatomy as any plugin (`package.json`, `backend/plugin.ts`,
  `frontend/src/plugin.tsx`, …).
- **nx tag:** every plugin app is tagged **`type:plugin`** in its `project.json`.
  CI targets the set with `--projects=tag:type:plugin` (test + pack the plugins)
  and the generic lint/typecheck/test/build jobs exclude it with
  `--exclude=...,tag:type:plugin`, exactly mirroring how `scope:hardware` is
  handled. List the plugin apps any time with:

  ```bash
  pnpm nx show projects --projects=tag:type:plugin
  ```

- **Build recipe:** the esbuild/Vite/npm-pack recipe described above is shared across
  plugin apps via `apps/plugins/scripts/` (`esbuild-backend.mjs`,
  `vite-federation.config.mjs`, `verify-packed-plugin.mjs`). Each plugin's `project.json`
  wires them into nx targets:

  | Target           | Produces                                                                |
  | ---------------- | ----------------------------------------------------------------------- |
  | `build-backend`  | `package/dist/index.js` (esbuild, CommonJS, host packages externalized) |
  | `build-frontend` | `package/frontend/remoteEntry.js` (Vite federation remote)              |
  | `build`          | copies `package.json` into `package/` (depends on the two builds)       |
  | `pack`           | `dist/*.tgz` — the npm package artifact (depends on `build`)            |
  | `pack-test`      | validates the packed tarball and loads its backend                      |
  | `publish`        | publishes a new package version to npm                                  |

  ```bash
   # Build and pack a single plugin app:
   pnpm nx pack plugin-rabbitmq
  # …or every plugin app at once:
   pnpm nx run-many --target=pack --projects=tag:type:plugin
  ```

- **CI:** pull requests test and pack affected plugin apps. Every main-branch
  build publishes every plugin app tagged `type:plugin` as a unique
  `-nightly.<run>` version under npm's `next` tag. Release CI publishes changed
  tagged plugin apps with a new version under `latest`.

## See Also

- [Plugins Overview](plugins/overview.md) — What are plugins?
- [Installing Plugins](plugins/installing-plugins.md) — Upload and manage plugins
- [Example plugin source](https://github.com/Attraccess/Attraccess/tree/main/examples/plugin-hello-world) — the `plugin-hello-world` walkthrough code
- [Developer Guide](developer/overview.md) — Attraccess architecture and development
- [API Reference](developer/api-reference.md) — Attraccess REST API
