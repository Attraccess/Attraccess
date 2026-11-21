# Developing Plugins

<!-- llms-description: Developer guide to building Attraccess plugins: anatomy, SDKs, backend plugins, dependencies and reader UI integration. -->

Attraccess plugins extend the platform with new API endpoints, background
behaviour, and UI pages — without forking the core. A plugin can ship a
**backend** half, a **frontend** half, or both, published as an npm package and
installed through the admin [Plugins](plugins/installing-plugins.md) page.

## Official plugin classification

Plugin packages are Community by default. Attraccess marks a package Official only when it is installed from the public npm registry (`https://registry.npmjs.org`) and its name starts with `@attraccess/plugin-`. npm only lets members of the `attraccess` npm organization publish to the `@attraccess` scope, so the scope is what proves the package comes from Attraccess. Package metadata (such as an `official` flag) cannot grant this label, and the same name served by any other registry or mirror stays Community. The rule lives in `apps/api/src/plugin-system/plugin-classification.service.ts`.

Official packages are published from this repository's GitHub Actions workflows through npm trusted publishing, so each version carries a provenance attestation that links it to the commit and workflow that built it. Official means maintained by Attraccess; it does not imply a security sandbox or guarantee of safety. Installers must still review the source and requested permissions.

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
    "@attraccess/plugins-backend-sdk": "^2.0.0-0",
    "@attraccess/plugins-frontend-sdk": "^2.0.0-0"
  },
  "attraccess": {
    "displayName": "Hello World",
    "host": "^2.0.0-0",
    "backend": "dist/index.js",
    "frontend": "frontend/remoteEntry.js",
    "styles": "frontend/style.css",
    "dashboardPaths": ["/hello-world"],
    "permissions": ["READ_USERS", "LISTEN_EVENTS"],
    "sdk": { "backend": "^2.0.0-0", "frontend": "^2.0.0-0" }
  }
}
```

| Field                                        | Required     | Notes                                                                                                       |
| -------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| `name`                                       | yes          | Immutable npm package identifier.                                                                           |
| `version`                                    | yes          | Your plugin's semantic version.                                                                             |
| `attraccess.backend` / `attraccess.frontend` | at least one | Relative package entry point.                                                                               |
| `attraccess.styles`                          | no           | Stylesheet alongside the frontend entry point.                                                              |
| `attraccess.dashboardPaths`                  | no           | Sidebar paths users may pin to their dashboard. See [Dashboard pins](#dashboard-pins).                      |
| `attraccess.dashboardWidgets`                | no           | Ids of the dashboard widgets the plugin offers. See [Dashboard widgets](#dashboard-widgets).                |
| `attraccess.host`                            | yes          | Compatible Attraccess host semver range.                                                                    |
| `attraccess.permissions`                     | no           | Backend capabilities you need (see [Permissions](#backend-plugin-permissions)). Defaults to `[]`.           |
| `attraccess.license`                         | no           | License modules or a valid license the plugin requires (see [License requirements](#license-requirements)). |

## Dependencies on other Attraccess plugins

Declare plugin dependencies in `package.json` under `attraccess.dependencies`:

```json
{
  "attraccess": {
    "dependencies": [{ "name": "@example/3d-printer-core", "version": "^1.0.0", "required": true }]
  }
}
```

`name` is the immutable npm package identity, `version` is a semver range (not a dist-tag or URL), and `required` defaults to `true`. Duplicate identities are rejected. These entries represent installed Attraccess plugins with their own modules, permissions, migrations, and state. Keep ordinary JavaScript runtime dependencies in npm's top-level `dependencies`.

The marketplace resolves the entire required dependency graph before installation and displays the resolved versions, sources, classifications, and permissions for confirmation. Compatible installed plugins are reused; missing plugins are installed together. Conflicting installed versions are not automatically replaced. Cycles and incompatible ranges block the operation with an explanation. Dependencies resolve from the selected registry, so publish dependencies there too; an already-installed compatible dependency may come from another registry.

Optional dependencies (`required: false`) are not installed automatically and do not gate activation. If present, their versions must satisfy the declared range. Required dependencies load and migrate before their dependants. A missing, incompatible, quarantined, or failed required dependency keeps its dependants inactive; the Plugins settings page shows the failure. Repair the dependency and restart to reactivate its dependants.

Updates and downgrades must satisfy both the target version's dependencies and installed dependants' requirements. Removing a required dependency requires explicit confirmation of every direct and transitive dependant to remove in the same operation. Automatically installed dependencies remain ordinary plugins and are not automatically removed when their last dependant is removed. Package changes commit together; migrations and runtime activation run on restart, using the existing plugin lifecycle. Removing npm plugins retains their data and secrets.

## License requirements

A plugin can require an Attraccess license. The host enforces the requirement with the same license logic as core
features (a valid key, optionally with named modules), so a plugin never re-implements a license check.

A plugin without its own license terms is under the core license (see the `LICENSE.md` of the repository), including
its free use by private individuals and non-profit organizations. A plugin with its own commercial license is not
covered by that non-profit permission: it ships its own `LICENSE.md` and declares its paid module as below. The
non-profit key grants the core modules only and **never a plugin module**.

### Declaring a requirement

Add an optional `license` block. In a ZIP plugin it belongs in `plugin.json`; in an npm plugin it belongs in
`package.json` under `attraccess` (the host builds the manifest from it):

```json
{ "license": { "required": true, "modules": ["wago"] } }
```

| Field      | Type       | Meaning                                                                                                              |
| ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `modules`  | `string[]` | License modules without which the plugin must not load at all. A non-empty list implies `required`.                  |
| `required` | `boolean`  | The plugin needs a valid Attraccess license (the non-profit key counts) but no specific module. Defaults to `false`. |

Anything declared here is a hard requirement. The host evaluates the license **once at startup**, before it loads any
plugin. If the requirement is not met, the plugin is not loaded at all: no backend, migrations, flow nodes, audit
domains, reader UI, hooks or frontend. **Settings → Plugins** shows it as **License missing**, with the missing modules.
If the license cannot be determined (no key, a key that does not verify, unreadable settings), a gated plugin counts as
unlicensed. A fresh install has no key until an administrator enters one in Settings, so its gated plugins load after
the next restart. A plugin that has a required dependency on an unlicensed plugin does not load either; it shows the
usual dependency error.

Not loading for license reasons is not a failure: the plugin is not quarantined, and it loads after the next restart
once the license covers it. An invalid `license` block (wrong types, unknown keys) is a manifest error: the plugin does
not load (**Settings → Plugins** lists it with the error, so it can be deleted), and a ZIP upload is rejected with
HTTP 400. Hosts older than the plugin license support ignore the block. For
npm plugins, set `attraccess.host` to the first version that enforces it; the host checks that range on install. A ZIP
plugin's `attraccessVersion` is not compared with the host version, so an old host loads a ZIP plugin without the
gate.

When an administrator saves a different, valid license key or removes the key, the host checks the plugins again. It
restarts automatically exactly when that changes whether at least one gated plugin loads. An invalid, expired or
unverifiable key never restarts, because the host refuses to start with it. There is no periodic re-check: an expired
license is noticed at the next startup.

### Deciding at runtime

If a plugin should offer more or less depending on the license instead of not loading at all, it does **not** declare
the module in the manifest. It asks the host and decides itself. The host does not block the routes or UI of such a
plugin.

**Backend:** `context.license` (optional in the type, because older hosts do not provide it; it needs no permission):

| Member                          | Purpose                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `license.getLicense()`          | `{ valid, reason?, modules, usageLimits, isNonProfit }`. Never throws: when the license cannot be determined, `valid` is `false`.     |
| `license.hasModule(module)`     | `true` only if the license is valid and grants the module. `false` when it cannot be determined.                                      |
| `license.verify(requirements?)` | Resolves if the license is valid and satisfies `{ modules?, usageLimits? }`, otherwise throws a `PluginLicenseError` with a `reason`. |

Every call checks the license anew (a local signature check, no network request), so a plugin sees a changed key
without a restart. An invalid license reports no modules and no usage limits. In hot paths, such as per message or per
reader event, check once per operation rather than per item.

```ts
import { PluginLicenseError } from '@attraccess/plugins-backend-sdk';

// Offer the export only with the `reports` module. `false` on hosts without `context.license`.
if (!(await context.license?.hasModule('reports'))) throw new ForbiddenException('Requires the reports module');

// Or fail with the host's reason. Check for `context.license` first: on an older host, `?.verify` would do nothing.
if (!context.license) throw new ForbiddenException('This host cannot check the license');
try {
  await context.license.verify({ modules: ['reports'], usageLimits: { users: userCount } });
} catch (error) {
  if (error instanceof PluginLicenseError) throw new ForbiddenException(error.reason);
  throw error;
}
```

**Frontend:** `usePluginLicense()` from `@attraccess/plugins-frontend-sdk` reads `GET /api/license-data` (for a signed-in
user). It returns `{ license, isLoading, error, hasModule(module), refetch() }`; `hasModule` is `false` while loading or
when the license is unknown. Mounted hooks share one request for 30 seconds; `refetch()` asks again.
`fetchPluginLicense()` does the same request without React.

```tsx
import { usePluginLicense } from '@attraccess/plugins-frontend-sdk';

function Reports() {
  const { hasModule, isLoading } = usePluginLicense();
  if (isLoading) return null;
  return hasModule('reports') ? <ReportsPage /> : <p>Reports need the reports license module.</p>;
}
```

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
// the SDK root: Symbol.for() resolves against the process-global registry, so
// this is the exact same symbol the host uses.
const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

// SystemEvent is imported as a TYPE only (erased at build time); supply the enum
// value as a string-literal cast to keep the artifact SDK-free at runtime.
const RESOURCE_USAGE_STARTED = 'RESOURCE_USAGE_STARTED' as SystemEvent;

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
    // Host data is read through context.hostData as neutral values, never as
    // entities. The users group is gated behind READ_USERS.
    const names = await this.context.hostData.users.getUsernames([1, 2, 3, 4, 5]);
    return [...names.values()].map((username) => `Hello, ${username}!`);
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

| Member                                                    | Purpose                                                                                                                                                           | Permission               |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `context.manifest`                                        | Your plugin's name, version, id, directory.                                                                                                                       | none                     |
| `context.hostVersion`                                     | Version of the running Attraccess host (the one plugin compatibility is checked against). Optional: hosts older than 1.11.0 do not set it, so handle `undefined`. | none                     |
| `context.logger`                                          | Logger prefixed with your plugin name.                                                                                                                            | none                     |
| `context.storage`                                         | Record port for the tables your plugin declares. See [Plugin Storage](plugins/plugin-storage.md).                                                                 | `PLUGIN_STORAGE`         |
| `context.persistence`                                     | Atomic transactions over your storage and host ports, with a post-commit hook. See [Persistence](#persistence).                                                   | `PLUGIN_STORAGE`         |
| `context.hostData`                                        | Read-only lookups of host data (resources, users, settings, flow nodes) as neutral models. See [Host data](#host-data).                                           | per group (see below)    |
| `context.onEvent(event, handler)`                         | Subscribe to a typed `SystemEvent`.                                                                                                                               | `LISTEN_EVENTS`          |
| `context.emitEvent(event, payload)`                       | Emit a typed `SystemEvent`.                                                                                                                                       | `EMIT_EVENTS`            |
| `context.events`                                          | The raw shared event bus (restricted surface).                                                                                                                    | per-method               |
| `context.get(token)`                                      | Resolve an arbitrary host provider by token.                                                                                                                      | `RESOLVE_HOST_PROVIDERS` |
| `context.getMqttServerConfig(serverId)`                   | Resolve an MQTT server's connection config + resolved (decrypted) credentials.                                                                                    | `ACCESS_MQTT_SERVERS`    |
| `context.mqtt.subscribe(serverId, topicFilter, handler)`  | Subscribe through the host's shared MQTT connection; resolves after broker acknowledgement.                                                                       | `ACCESS_MQTT_SERVERS`    |
| `context.mqtt.publish(serverId, topic, payload, options)` | Publish through the host's shared MQTT connection.                                                                                                                | `ACCESS_MQTT_SERVERS`    |
| `context.notifications.dispatch(request)`                 | Notify users under a category your plugin declared. See [Notifications](#notifications).                                                                          | `SEND_NOTIFICATIONS`     |
| `context.startBlocked.invalidate({ resourceId })`         | Tell open resource pages that your `startBlockedQuery` answer changed. See [Start-blocked state](#start-blocked-state).                                           | `ACCESS_HOOKS`           |
| `context.resourceAccess`                                  | Read-only authorization, maintenance and session queries. See [Resource access](#resource-access-queries).                                                        | `ACCESS_RESOURCES`       |
| `context.license`                                         | Query the license (`getLicense`, `hasModule`, `verify`). Optional: older hosts do not provide it. See [License requirements](#license-requirements).              | none                     |
| `context.ble`                                             | Bluetooth transport through Attractap readers: profiles, endpoints, sessions. See [Bluetooth Transport for Plugins](plugins/ble-transport.md).                    | `BLE_TRANSPORT`          |
| `context.cards`                                           | Authenticate NFC cards held to your plugin's own devices. See [Card Authentication for Plugins](plugins/card-authentication.md).                                  | `CARD_AUTHENTICATION`    |
| `context.readers`                                         | Register your plugin's own card readers and run their action on their resource for a card authenticated on them. See [Plugin Readers](plugins/plugin-readers.md). | `READER_DEVICES`         |

> [!IMPORTANT]
> A plugin has no database access. Keep data of your own in declared tables through `context.storage`
> (see [Plugin Storage](plugins/plugin-storage.md)) and read host data through the host ports. Never open your own
> database connection or instantiate a second `EventEmitter`. The SDK has no TypeORM, no `DataSource`, no
> `Repository`, no raw SQL and no host entity classes.

### Backend plugin permissions

A backend plugin runs arbitrary code inside the host process, so every host
capability it touches must be declared up front in the manifest's `permissions`
array. At runtime the host hands your plugin a **guarded** `PluginContext`:
accessing a capability whose permission you did not declare throws a clear error
naming the missing permission.

| Permission               | Grants access to                                                                                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `READ_USERS`             | `context.hostData.users` — read user names, languages, account state and role-based permission holders.                                                                                                                                             |
| `ACCESS_RESOURCES`       | `context.hostData.resources` — read resources — and the read-only `context.resourceAccess` queries. See [Resource access](#resource-access-queries).                                                                                                |
| `READ_SETTINGS`          | `context.hostData.settings` — read application settings.                                                                                                                                                                                            |
| `PLUGIN_STORAGE`         | `context.storage` and `context.persistence`: the declared tables of your own plugin and transactions over them. No access to core tables. See [Plugin Storage](plugins/plugin-storage.md).                                                          |
| `TRIGGER_FLOWS`          | `context.flows.trigger(...)` and `context.hostData.flows` (flow node lookups).                                                                                                                                                                      |
| `EMIT_EVENTS`            | `context.emitEvent(...)` and `context.events.emit(...)` / `emitAsync(...)`.                                                                                                                                                                         |
| `LISTEN_EVENTS`          | `context.onEvent(...)` and `context.events.on(...)` / `once(...)` / ...                                                                                                                                                                             |
| `RESOLVE_HOST_PROVIDERS` | `context.get(token)` — resolve arbitrary host services by token.                                                                                                                                                                                    |
| `ACCESS_MQTT_SERVERS`    | `context.getMqttServerConfig(serverId)`, `context.mqtt.subscribe(...)`, and `context.mqtt.publish(...)` — access an MQTT server through the host's pooled connection.                                                                               |
| `READER_UI`              | `context.readerUi.invalidate(...)` and the `readerUi` provider — show widgets on Attractap reader screens. See [Reader UI](#reader-ui-and-start-hooks).                                                                                             |
| `ACCESS_HOOKS`           | The `preStartHook`, `sessionEndHook`, `startBlockedQuery` and `startCapacityHook` — ask for a confirmation or block a session start, and show a blocked start in the UI. See [Reader UI](#reader-ui-and-start-hooks).                               |
| `SEND_NOTIFICATIONS`     | `context.notifications.dispatch(...)` — send in-app, push and email notifications under categories the plugin declares, and declare editable email templates. See [Notifications](#notifications).                                                  |
| `BLE_TRANSPORT`          | `context.ble` — use the Bluetooth radio of Attractap readers an administrator opened for plugins, limited to the BLE profiles your plugin registers. See [Bluetooth Transport for Plugins](plugins/ble-transport.md).                               |
| `CARD_AUTHENTICATION`    | `context.cards` — authenticate NFC cards held to your plugin's own devices with the Attraccess card keys; your plugin gets the card and its owner, never the keys. See [Card Authentication for Plugins](plugins/card-authentication.md).           |
| `READER_DEVICES`         | `context.readers` — register your plugin's own card readers; a card authenticated on one runs its action on its assigned resource for the card owner, with the same checks as an Attractap reader. See [Plugin Readers](plugins/plugin-readers.md). |

### Plugin-declared RBAC permissions

The manifest `permissions` above are **host capabilities** your plugin code may use. RBAC permission keys are a
different thing: they decide which **users and API tokens** may call your routes, open your pages and subscribe to
your live topics. A plugin can declare its own keys instead of reusing broad core keys such as
`system.plugins.manage`. The host adds them to the permission catalog, so administrators see them in the role editor
and the API-token picker, grouped under the plugin's name.

Every host that loads SDK 2 plugins supports plugin-declared keys, so the `attraccessVersion.min` of `2.0.0-0` that
SDK 2 requires already covers them.

#### Declaring keys

Declare the keys once with `definePluginPermissions` and export the declaration as `permissions` on the backend
module:

```typescript
// backend/permissions.ts
import { definePluginPermissions } from '@attraccess/plugins-backend-sdk';

export const ACME_PERMISSIONS = definePluginPermissions({
  // Optional group label in the role editor; defaults to the plugin name from the manifest.
  category: { en: 'Acme widgets', de: 'Acme-Widgets' },
  permissions: [
    {
      key: 'acme.widgets.read',
      label: { en: 'View widgets', de: 'Widgets anzeigen' },
      description: { en: 'View widgets and their status', de: 'Widgets und ihren Status anzeigen' },
      defaultRoles: ['administrator', 'resource-manager'],
    },
    {
      key: 'acme.widgets.manage',
      label: { en: 'Manage widgets', de: 'Widgets verwalten' },
      description: { en: 'Create, change and delete widgets', de: 'Widgets anlegen, ändern und löschen' },
    },
  ],
});

export const WIDGETS_READ = ACME_PERMISSIONS.keys['acme.widgets.read'];
export const WIDGETS_MANAGE = ACME_PERMISSIONS.keys['acme.widgets.manage'];
```

```typescript
// backend/plugin.ts
const plugin: PluginBackendModule = {
  permissions: ACME_PERMISSIONS,
  register(context) {
    /* … */
  },
};
```

Every key needs an English and a German label and description; the role editor shows them in the user's language.

#### Key format and collision rules

The host validates the declaration when it loads the plugin:

- A key is lowercase dotted segments with at least two segments (`PLUGIN_PERMISSION_KEY_PATTERN`,
  `^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$`), at most 100 characters. Prefix keys with your plugin's name.
- A key must not equal a core key and must not start with a reserved core namespace
  (`RESERVED_PERMISSION_NAMESPACES`): `resources.`, `users.`, `system.`, `billing.`.
- A plugin must not declare the same key twice.
- A key belongs to the first plugin that registered it. Another plugin declaring it later is rejected, even while
  the owner is uninstalled.
- `defaultRoles` may name system roles only (`PLUGIN_PERMISSION_DEFAULT_ROLES`): `user`, `resource-manager`,
  `user-manager`, `billing-manager`, `system-admin`, `administrator`.

A violation fails only your plugin's load: it is quarantined with an error naming the key and the rule, and the host
and every other plugin keep running.

#### Default roles

- `defaultRoles` are granted **only when the key is registered for the first time**. Later boots never add the grant
  again, so an administrator who removes a key from a role keeps it removed.
- The `administrator` role always holds every available plugin key, whether you list it or not. The host re-asserts
  this on every boot, which keeps the "last administrator" safeguards working.
- Custom roles never receive plugin keys automatically. Tell administrators in your plugin's documentation which
  keys to add to their custom roles.

Plugin keys reach SSO users through roles, like core keys: SSO maps provider groups to roles, not to permission keys.

#### When a plugin is unavailable

When a plugin is uninstalled (uploaded ZIP or npm package), quarantined or fails to load, or a newer version no
longer declares a key, its keys become **unavailable**:

- They disappear from the permission catalog, the role editor and the API-token picker.
- They grant nothing, even to roles and API tokens that hold them.
- The role and API-token grants stay in the database. Saving a role or a token in the UI keeps the hidden grants.
- When the plugin loads again, the keys and all their grants come back.

Uninstalling an uploaded plugin deletes the plugin's own data (the host drops its declared tables) but keeps its permission
rows and grants. A plugin cannot write to the core RBAC tables (`permission`, `role_permission`,
`api_token_permission`): it has no access to core tables, the host manages them.

#### Using the keys

The keys from `definePluginPermissions` are typed, so the auth decorators accept them without casts:

```typescript
import { Auth, AuthAny, SessionAuth } from '@attraccess/plugins-backend-sdk';

@Controller('acme/widgets')
export class WidgetsController {
  @Get()
  @Auth(WIDGETS_READ)
  list() {}

  @Post()
  @Auth(WIDGETS_MANAGE)
  create() {}

  // Session only: API tokens are refused even when they carry the key.
  @Get('secret-export')
  @SessionAuth(WIDGETS_MANAGE)
  exportSecret() {}
}
```

A route without the key answers `403` before your handler runs. API tokens work as for core keys: a token's scope
may only contain keys its owner holds, and a request gets the keys in both the scope and the owner's current
permissions. `context.resourceAccess.hasPermission(principal, WIDGETS_READ)` accepts the keys as well.

Live topics check them in `authorize`, which runs on every subscription and every lease renewal. Live updates are
session-only, so API tokens cannot subscribe:

```typescript
context.liveUpdates.register({
  topic: 'widgets',
  identifier: 'none',
  authorize: (_subscription, user) => {
    if (!user.effectivePermissions?.has(WIDGETS_READ)) throw new ForbiddenException();
  },
  source: () => widgets$,
});
```

In the frontend, gate routes with the plain key strings. `authRequired` takes one key or an array meaning "any of
these", and a sidebar entry follows its route. To hide controls inside a page, read the user's permissions from the
auth data the host passes to `onApiAuthStateChange`:

```tsx
import { hasPluginAuthPermission } from '@attraccess/plugins-frontend-sdk';

getRoutes(): RouteConfig[] {
  return [{ path: '/widgets', authRequired: ['acme.widgets.read', 'acme.widgets.manage'], element: <WidgetsPage /> }];
}

onApiAuthStateChange(authData: AttraccessFrontendPluginAuthData | null): void {
  this.canManage = hasPluginAuthPermission(authData, 'acme.widgets.manage');
}
```

Keep the key strings in a module without SDK imports if both halves of your plugin share it, so the frontend bundle
does not pull in the backend SDK.

Holders of any plugin key count as **privileged** for two-factor authentication, like every key outside
`resources.*`. If your deployment requires 2FA for privileged users, granting a plugin key requires them to enroll.

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

- `PLUGIN_STORAGE` covers your **own** declared tables only. It does not include `READ_USERS`,
  `ACCESS_RESOURCES`, `READ_SETTINGS` or `TRIGGER_FLOWS`: each `hostData` group checks its own permission when a
  method is called. There is no way to read arbitrary host tables.
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

Further events for plugins that follow maintenance, health and live sessions
(all require `LISTEN_EVENTS`, payloads are `Date`-typed as in the SDK):

| Event                                           | Payload                                                                                           | Fires                                                                                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SystemEvent.MAINTENANCE_CHANGED`               | `{ resourceId, maintenanceId, action: 'created' \| 'updated' \| 'finished', startTime, endTime }` | After a maintenance window was created or finished. Core currently emits `created` and `finished` only; `updated` is reserved for a future edit path. `endTime` is `null` while open-ended. |
| `SystemEvent.RESOURCE_HEALTH_CHANGED`           | `{ resourceId, status, previousStatus, reason, identifier }`                                      | Only on a real status transition of a health entry.                                                                                                                                         |
| `SystemEvent.RESOURCE_USAGE_SESSION_STARTED`    | `{ resourceId, usageId, userId, startTime, supervisorUserId }`                                    | A user started a session on an idle resource (not a takeover). `supervisorUserId` is set for supervised starts.                                                                             |
| `SystemEvent.RESOURCE_USAGE_SESSION_TAKEN_OVER` | `{ resourceId, usageId, userId, startTime, previousUsageId, previousUserId }`                     | A user took over a running session. Fires for the **new** user.                                                                                                                             |
| `SystemEvent.RESOURCE_USAGE_SESSION_ENDED`      | `{ resourceId, usageId, userId, startTime, endTime, reason: 'ended' \| 'taken_over' }`            | A session ended, explicitly or because it was taken over.                                                                                                                                   |

`SystemEvent.RESOURCE_SESSION_LIMIT_CHANGED` carries a `ResourceSessionLimitChangedPayload`:

| Event                                        | Payload                                                | Fires                                                                                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SystemEvent.RESOURCE_SESSION_LIMIT_CHANGED` | `{ resourceId, previousLimit, newLimit, actorUserId }` | After commit, when the effective session limit of a resource changed (`maxParallelSessions`, or a type change that changes the limit). The limit is 1 for doors and other non-machine types. `actorUserId` is `null` when no user made the change. |

### Notifications

With `SEND_NOTIFICATIONS` a plugin notifies users in the app, by push and by
email, respecting each user's notification preferences. Declare the categories
on the backend module and dispatch under their short ids:

```ts
const plugin: PluginBackendModule = {
  notificationCategories: [{ id: 'reminders', label: { en: 'Reminders', de: 'Erinnerungen' } }],
  register(context) {
    // keep `context` and call notify(context, ...) from your handlers
    return { module: MyPluginModule };
  },
};

async function notify(context: PluginContext, userId: number) {
  await context.notifications.dispatch({
    category: 'reminders',
    recipients: [userId],
    title: 'Your booking starts soon',
    body: 'Booking #12 starts at 14:00.',
    url: '/reservations/12', // relative to the application URL
    severity: 'info', // or 'warning'
    dedupeKey: 'reservations:reminder:12', // collapses repeated push messages
    // an email template your plugin declared, see Email templates below
    email: { template: 'reminder', variables: { booking: { id: 12, start: '14:00' } } },
  });
}
```

- A category id is short and unique within the plugin (lowercase letters, digits, `-`, `_`). The host namespaces it as
  `plugin.<pluginName>.<id>` and lists it, with your `label`, in every user's notification preferences under the
  plugin's name. Dispatching an undeclared category is rejected. Declaring categories without `SEND_NOTIFICATIONS`
  quarantines the plugin at load time.
- Unknown user ids are skipped and duplicates are collapsed. An email is only sent when `email` is set and the
  recipient's preferences allow email for the category. The host renders it inside the global email layout.
  Prefer an [email template](#email-templates): admins can edit it. Raw content (`email: { subject, text, html? }`)
  remains possible for mails that must not be edited; `html` is a trusted fragment, `text` is used (escaped) when
  `html` is omitted.
- Dispatching is not transactional: if it fails, the plugin decides whether to retry. The reservations plugin claims
  a "sent" flag first and never retries, so its notices are at most once.

### Email templates

Mails a plugin sends should be editable like the system's own mails. A plugin declares its templates on the backend
module, and the host stores, lists and renders them with the same mechanism as the core templates: the global layout,
per-locale translations, the editor under **Settings → Email → Templates**, and the `{{t "key" "default"}}` helper.
Declaring templates requires `SEND_NOTIFICATIONS`; without it the plugin is quarantined at load time.

```ts
const plugin: PluginBackendModule = {
  notificationCategories: [{ id: 'reminders', label: { en: 'Reminders', de: 'Erinnerungen' } }],
  emailTemplates: [
    {
      id: 'reminder', // short id; the stored key is plugin.<pluginName>.reminder
      label: { en: 'Booking reminder', de: 'Buchungserinnerung' }, // name in the template list
      variables: ['booking.id', 'booking.start'], // offered in the editor ("Variables")
      subject: '{{t "subject" "Reminder: booking {id}" id=booking.id}}',
      body: `<mj-section><mj-column>
  <mj-text>{{t "greeting" "Hello {name}," name=user.username}}</mj-text>
  <mj-text>{{t "body" "Your booking starts at {start}." start=booking.start}}</mj-text>
  <mj-button href="{{host.frontend}}/reservations/{{booking.id}}">{{t "open" "Open booking"}}</mj-button>
</mj-column></mj-section>`,
      translations: {
        de: {
          subject: 'Erinnerung: Buchung {id}',
          greeting: 'Hallo {name},',
          body: 'Ihre Buchung beginnt um {start}.',
          open: 'Buchung öffnen',
        },
      },
    },
  ],
  register: (context) => ({ module: MyPluginModule }),
};

await context.notifications.dispatch({
  category: 'reminders',
  recipients: [userId],
  title: 'Your booking starts soon',
  body: 'Booking #12 starts at 14:00.',
  email: { template: 'reminder', variables: { booking: { id: 12, start: '14:00' } } },
});
```

- **Declaration.** `subject` is a Handlebars string (usually one `t` call), `body` an MJML **fragment** without an
  `<mjml>` root, which the host places in the global layout. English texts are the inline defaults of the `t` calls;
  `translations.de` is required and must contain every `t` key (the plugin is quarantined otherwise). More locales may
  be added next to `de`. Ids use lowercase letters, digits, `-` and `_`, and are unique within the plugin. Subject and
  body must be valid Handlebars using only `t` and the built-in helpers (`if`, `unless`, `each`, `with`); partials and
  decorators are not supported. Any declaration error, including a Handlebars syntax error, quarantines the plugin at
  load time, so none of its hooks, categories or templates are registered.
- **Variables.** `user.*`, `host.*` and `url` are always available; your `variables` object is merged next to them and
  can never replace them. Values are HTML-escaped by the `t` helper and by `{{ }}`. List every variable the editor
  should offer in `variables`. The locale of the recipient decides the language; a plugin never picks it.
- **Storing and upgrades.** The host stores a declared template at startup, the first time its plugin is loaded with
  it, together with the shipped translations. From then on the stored template belongs to the admins: subject, body
  and translations are **never overwritten**, so their edits (including deleted translations) survive restarts and
  plugin upgrades, and new defaults a plugin update ships do not replace the stored ones. Only the variable list
  follows the declaration. **Reset to default** in the editor restores the currently declared version with its shipped
  translations. Templates of a plugin that is disabled or uninstalled stay stored but are neither listed nor sendable.
- **Admin UI.** Plugin templates appear in the same template list as core templates, after them, grouped by plugin
  and marked with the plugin's name; the editor, the translations dialog and the reset action work the same way.
- **Sending.** `email: { template, variables }` goes through `notifications.dispatch`, so each recipient's
  preferences for the category apply. Sending a template the plugin did not declare is rejected. An invalid MJML body is
  logged and the template is not registered, while the plugin's other templates still work. The application URL must
  be configured (as for every core mail).

### Resource access queries

`context.resourceAccess` (permission `ACCESS_RESOURCES`) answers read-only
authorization and state questions with the same logic the core uses to authorise
a session start, so plugin decisions never drift from it.

Methods marked with `principal` take either a user id or the request's user
(`PluginAccessPrincipal = number | { id, effectivePermissions? }`). **Pass
`request.user` for request-driven checks** so API-token scopes apply: an API
token only carries the permissions it was created with, and permission-based
grants are limited to that set (intersected with the user's current
permissions), exactly as on core routes. Introducer/maintainer roles and
introductions still count. A plain user id resolves the user's full RBAC
permissions; use it for background work such as schedulers. Unknown users and
resources yield negative answers (`false`, all-false, `[]`) rather than errors.

| Method                                          | Returns                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canStart(principal, resourceId)`               | `{ allowed, requiresSupervision, supervisionAllowed }`. Covers introductions, retraining blocks, introducers/maintainers, `resources.update` and the supervision mode. It does **not** consider live maintenance or health.                                                                                                                                                                                                                                                      |
| `canMaintain(principal, resourceId)`            | Whether the user can manage maintenance of the resource (`resources.maintenance.manage`, introducer/maintainer of the resource or one of its groups). Same check as core's maintenance API.                                                                                                                                                                                                                                                                                      |
| `canSeeUsageAttribution(principal, resourceId)` | Whether the user may see **who** is using the resource: core's rule for the current user's name in the resource UI and API (`resources.update`/`resources.access.manage`, people introduced to the machine, everybody when the instance shows activity to all). `false` where the user sees only free/in use (supervised-use machines in "introduced" mode), when the activity is hidden from the user and for unknown resources. Does not check hidden groups or account state. |
| `hasPermission(principal, permission)`          | Whether the user holds an RBAC permission such as `resources.update`, limited to the request's scope.                                                                                                                                                                                                                                                                                                                                                                            |
| `listResourceIdsIntroduced(principal)`          | Resources the user is introduced to in the sense of `canStart` (valid introduction, introducer/maintainer, `resources.update`).                                                                                                                                                                                                                                                                                                                                                  |
| `listResourceIdsMaintained(principal)`          | Resources whose maintenance the user can manage.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `getMaintenanceWindows(resourceId, from, to)`   | Windows overlapping `[from, to)` as `{ maintenanceId, resourceId, startTime, endTime \| null, reason \| null }`. Open-ended maintenance counts until it is finished.                                                                                                                                                                                                                                                                                                             |
| `getActiveSessions(resourceId)`                 | Running sessions `{ usageId, userId, startTime }`, earliest first.                                                                                                                                                                                                                                                                                                                                                                                                               |

### Persistence

A plugin has no database access. Data of your own lives in tables the plugin declares and reads and writes through
`context.storage` (permission `PLUGIN_STORAGE`); the host owns the engine, the DDL, the migrations and the backups.
Declaring the tables, writing the neutral migrations and the full port are described in
[Plugin Storage](plugins/plugin-storage.md). In short:

```ts
import { definePluginStorage, f, step, table } from '@attraccess/plugins-backend-sdk';

const bookings = table({ id: f.id(), slot: f.string(), userId: f.integer() });
const storage = definePluginStorage({
  tables: { bookings },
  migrations: [{ version: 1, name: 'create-bookings', steps: [step.createTable('bookings', bookings)] }],
});

const plugin: PluginBackendModule = {
  storage,
  register(context) {
    const { bookings } = context.storage.open(storage);
    /* ... */
  },
};
```

`context.persistence` (permission `PLUGIN_STORAGE`) has a single member, `transaction(work)`. It runs `work(scope)` in
one atomic transaction that commits when `work` resolves and rolls back when it throws. `scope.afterCommit(callback)`
runs only after the commit. It exposes no connection, repository, query API or engine information.

A plugin whose declaration breaks the rules (a TypeORM migrations entry, `persistence.backends`, a bundle importing
TypeORM, the removed `DATABASE_ACCESS` permission, a forbidden table name) is refused before anything of it is registered,
migrated or started, and no data changes. See [Migrating Plugins to SDK 2.0](plugins/migrating-to-2.md#refusals).

### Host data

`context.hostData` answers read-only questions about host data with neutral models and plain values, never entities or
query handles. Each group checks its own permission when a method is called.

| Group                | Permission         | Methods                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hostData.resources` | `ACCESS_RESOURCES` | `get(id, scope?)` (a `PluginResourceModel` or `null`; with a transaction scope it reads inside that transaction), `getNames(ids)`, `filterVisible(userId, ids, { seeAll? })`, `filterRequiringSupervision(ids)`, `listIdsInGroups(groupIds)`, `countUnhealthyEntries(id)`, `listIntroducerUserIds(id)`. |
| `hostData.users`     | `READ_USERS`       | `getUsernames(ids)`, `getLocales(ids)`, `isActive(id)` (exists, not deleted, not disabled), `listIdsWithAnyPermission(keys)`.                                                                                                                                                                           |
| `hostData.settings`  | `READ_SETTINGS`    | `getApp(key)`: the trimmed value of an application setting, or `null`.                                                                                                                                                                                                                                  |
| `hostData.flows`     | `TRIGGER_FLOWS`    | `findNodes(query)`: flow nodes by `type`, `typePrefix`, `dataEquals`, `dataIn`, `resourceId`, `excludeResourceId`, `excludeFlowId`, `orderById` and `limit`, as `{ id, type, resourceId, resourceName, flowId, flowName, data }`.                                                                       |

`PluginUserModel` (`id`, `username`, `locale`, `isDisabled`) and `PluginResourceModel` (`id`, `name`, `type`,
`description`, `allowTakeOver`, `maxParallelSessions`, `supervisionMode`) come from `@attraccess/application-models` and
are re-exported by the SDK root. They are also the payload of the `RESOURCE_USAGE_STARTED` and `RESOURCE_USAGE_ENDED`
events and the user of `AuthenticatedRequest`: tokens, contact data and other account fields never reach plugin code.

### Transactions

`persistence.transaction(work)` (permission `PLUGIN_STORAGE`) runs `work(scope)` in one transaction. It commits when `work` resolves and rolls back when it throws, which makes
check-then-write sequences such as overlap checks race-free. Pass `{ scope }` to every storage call that must take part:

```ts
const { bookings } = context.storage.open(storage);
await context.persistence.transaction(async (scope) => {
  const clash = await bookings.count({ slot: { gte: from, lt: to } }, { scope });
  if (clash > 0) throw new ConflictException('OVERLAP');
  await bookings.insert(newBooking, { scope });
  // Runs only after the commit, never on rollback. Failing callbacks are logged and do not undo the commit.
  scope.afterCommit(() => context.mqtt.publish(1, 'bookings/created', '{}'));
});
```

The host either orders concurrent transactions or fails one of them with `PluginStorageConflict`; it does not retry.
Keep effects in `afterCommit` so the caller can run the whole transaction again. Therefore:

- keep `work` short and limited to storage and host-port reads; do no HTTP, MQTT, email or other non-database I/O
  inside it. Register such effects with `scope.afterCommit`;
- do not nest calls. A transaction started inside `work` would wait for `work` itself, so the host rejects it with an
  error instead of hanging. Pass the `scope` down to helpers instead, and do not await core operations that write
  (such as starting or ending a session) inside `work`;
- pass `{ scope }` on every write inside `work`. A write without it is rejected with `PluginStorageInvalid`; only a
  read without a scope runs outside the transaction, and it does not see the uncommitted writes of `work`.

The host either orders the transactions of your plugin (one runs after the other) or fails one with
`PluginStorageConflict`; it never retries. On PostgreSQL every transaction of a plugin, and every write without a
scope, first takes a lock of that plugin in the database, so the order also holds across several API instances. Core
session starts and ends and other plugins are not queued behind it. State a plugin keeps in its process (an in-process
lock, a cache, a scheduler) is not shared between instances; the reservations plugin runs on a single instance for that
reason (see [Reservations](plugins/reservations/administration.md#single-instance-operation)).

### Flow nodes

A backend plugin can add nodes to the flow editor by returning `flowNodes` from its module (see `PluginFlowNodeDefinition` in the SDK). Trigger nodes (`isInput: true`) start flows when the plugin calls `context.flows.trigger(...)`, which needs the `TRIGGER_FLOWS` permission. The call matches the plugin's trigger nodes in resource flows **and** in enabled [global flows](flows/global-flows.md), using the same `matches` callback.

#### Flow scopes

Every node declares where it can be used with `flowScopes`:

```ts
const myNode: PluginFlowNodeDefinition = {
  type: 'plugin.demo.send-on',
  label: 'Send on',
  flowScopes: ['resource', 'global'], // default: ['resource']
  // ...
};
```

- `flowScopes` is `readonly ('resource' | 'global')[]` and **defaults to `['resource']`**. A node only shows up in global flows after it opts in. Saving a global flow that contains a node without the `global` scope fails with a validation error naming the node.
- `supportedByAllResources` filters resource flows only.
- In a global flow there is no fixed resource. A run has a triggering resource only when a resource event started it, so opt in only when your node copes with that.

#### The `resolveConfigSchema` context

`resolveConfigSchema(currentConfig, context)` receives:

```ts
{
  flowScope: 'resource' | 'global';
  resourceId: number | null; // set only in resource flows
  flowId: number | null; // set only in global flows
  purpose?: 'editor' | 'preview';
}
```

Plugins that do not opt in to global flows never see `null` in `resourceId`. Nodes that do opt in must handle both cases, and use `flowId` to identify a global flow, for example as the owner of a channel.

### Packaging the backend

A backend plugin shares the host's NestJS runtime and event bus. For dependency-injection identities to line up, your build must use
the _same_ copies of those packages the host already loaded — it must **not**
bundle its own. Split dependencies into two groups:

| Dependency                                                                                                                                                | How to declare it                                  | Why                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nestjs/common`, `@nestjs/core`, `@nestjs/event-emitter`, `eventemitter2`, `reflect-metadata`, `@nestjs/swagger`, `class-validator`, `class-transformer` | `peerDependencies`, **externalized** at build time | They carry the DI identities and the shared event bus. A bundled copy is a _different_ type and silently fails to connect.                    |
| `@attraccess/plugins-backend-sdk`                                                                                                                         | **externalized** at build time                     | The host serves its own instance to the plugin loader. Do not add `typeorm` or any database driver yourself: plugins have no database access. |
| Your own code                                                                                                                                             | bundle normally                                    | -                                                                                                                                             |

Ship a **CommonJS** entry point (`index.js`), not an ES module. A minimal
[esbuild](https://esbuild.github.io/) build that follows the rule:

```bash
esbuild backend/plugin.ts \
  --bundle --platform=node --format=cjs --outfile=dist/index.js \
  --external:@nestjs/common --external:@nestjs/core \
  --external:@nestjs/event-emitter --external:eventemitter2 \
  --external:reflect-metadata \
  --external:@nestjs/swagger --external:class-validator --external:class-transformer \
  --external:@attraccess/plugins-backend-sdk
```

> [!WARNING]
> If you bundle any of the externalized packages, your plugin may load without
> errors but quietly fail to receive events or resolve host
> services. When in doubt, keep the list above external.

## Reader UI and start hooks

Plugins can show small widgets on Attractap readers and add a confirmation step before a session starts.
A plugin only describes **data** (a "Reader UI schema v1" node tree). No plugin code runs on the reader; the
host validates, sanitizes and renders it. Admins configure this under **Reader display**, see
[Reader display](attractap/reader-ui.md).

| What                | Declared as                                                               | Permission     |
| ------------------- | ------------------------------------------------------------------------- | -------------- |
| Slot widgets        | `readerUi` (provider or `(context) => provider`)                          | `READER_UI`    |
| Pre-start hook      | `preStartHook`                                                            | `ACCESS_HOOKS` |
| Advisory after-stop | `sessionEndHook`                                                          | `ACCESS_HOOKS` |
| Start-blocked state | `startBlockedQuery` and `context.startBlocked.invalidate({ resourceId })` | `ACCESS_HOOKS` |
| Start capacity      | `startCapacityHook`                                                       | `ACCESS_HOOKS` |
| Re-render on change | `context.readerUi.invalidate({ resourceId?, readerId? })`                 | `READER_UI`    |

A plugin that declares `readerUi` or a hook without the matching permission **fails to load** and is quarantined.
The first-party [Reservations](plugins/reservations/overview.md) plugin is a real-world user of both hooks: its pre-start hook blocks or confirms starts around bookings, and its session-end hook asks the holder to keep or free the rest of a booking.
See `examples/plugin-reader-ui` for a working example.

### Slots

| Slot id                    | Where                                                                 | Node budget                                                                                                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resourceList.row.status`  | status line of a resource list row and of the lock screen             | 1 `text` or `badge`, at most 24 characters. Shown only when no core status (in use, maintenance, unavailable, introduction required) applies. The lock screen shows while nobody is signed in, so only what you contributed without a card session ever appears there. |
| `resource.details.header`  | below the description on resource details                             | 6 nodes                                                                                                                                                                                                                                                                |
| `resource.details.body`    | resource details body                                                 | 8 nodes                                                                                                                                                                                                                                                                |
| `resource.details.session` | only while a usage is active (`ctx.sessionActive`); card session only | 6 nodes                                                                                                                                                                                                                                                                |

`ctx.sessionActive` (optional boolean) tells you whether the resource has an active usage visible on this reader.
The reader shows `resource.details.session` only while that is `true`, so put a fact in that slot when it is `true`
and in `resource.details.body` otherwise, and never in both: a booking or free window should appear in one block per
screen. The host calls your provider again when a usage starts, ends or is taken over; the update limit of once per
2 s per reader and slot still applies. A host that does not send the field leaves it unset; treat that as `false`.

Components: `col`, `row`, `text`, `badge`, `icon` (`ok`, `warning`, `bell`, `lock`, `clock`), `progress`,
`countdown`, `spacer`. Slot trees must not contain `button`. Tones are `primary`, `success`, `warning`, `danger`;
`danger` cannot be combined with the `lock` icon.

```ts
const readerUi: ReaderUiProvider = {
  getSlotContributions(ctx) {
    return [
      {
        slotId: 'resource.details.header',
        key: 'free-until',
        tree: {
          t: 'row',
          c: [
            { t: 'icon', name: 'clock' },
            { t: 'text', text: 'Free until 14:00' },
          ],
        },
        expiresAt: new Date('2026-11-01T14:00:00Z'), // the host calls the provider again then
        fallback: { text: 'Free until 14:00' },
      },
    ];
  },
};
```

### Time zone on readers

Readers show one clock, and your texts must agree with it. If your plugin writes times on reader screens (for
example "Free until 14:00"), implement `getTimeZone` on the provider and return the IANA zone your texts use:

```ts
const readerUi: ReaderUiProvider = {
  getSlotContributions(ctx) {
    /* ... */
  },
  getTimeZone({ resourceId }) {
    return resourceHasMyFeature(resourceId) ? 'Europe/Berlin' : undefined; // undefined = no opinion
  },
};
```

The host asks the plugins of a reader's resources (with the same 1.5 s timeout as slots; an error counts as no opinion)
and uses the **first valid zone in host order**: the reader's resources by id, and for each resource the plugins in host
order (alphabetically by plugin name); a slower plugin that answers within the time limit still wins over a faster one
ranked lower. It sends the zone's UTC offset to the reader, daylight saving included. An invalid name is ignored, and
names are compared canonically (`europe/berlin` is `Europe/Berlin`). If the answers differ for one reader, the first
wins and admins get an alert. Without any answer the reader follows the server's `TZ`. If a plugin that could decide the
zone times out, the host keeps the reader's current zone; without one yet it uses the next valid answer for now. Either
way it asks again on a later heartbeat of the reader, after 5 s and then less often, up to every 5 minutes. Call
`context.readerUi.invalidate(...)` when your zone changes; the host then re-resolves it and pushes the new offset, and
the session start times of the resource list, to the affected readers at once. Do not write the current time into your
texts: the reader's footer shows it on every screen except the lock screen, the signed-out list and the session summary
(which has no footer unless a plugin question is open over it), so "check in by 14:15" can be related to now.

### Limits

| Limit                       | Value                                                                    |
| --------------------------- | ------------------------------------------------------------------------ |
| UI payload                  | 3072 bytes UTF-8 after sanitizing; the frame is at most 4096 bytes       |
| Nodes / depth               | 32 per tree / 5                                                          |
| Live nodes per reader       | 64                                                                       |
| Text                        | 80 characters (2 lines, clipped with "...")                              |
| Button / choice label       | 31 bytes                                                                 |
| Choices                     | at most 4                                                                |
| Ids (`key`, button, choice) | `[a-z0-9_-]{1,24}`                                                       |
| Contributions               | at most 8 per resource; updates at most once per 2 s per reader and slot |

The host rejects invalid contributions, logs them with the plugin name and never sends them to the reader; the
reader editor shows them as **Skipped** with "invalid content". Text that equals a core status ("Maintenance",
"Access granted", ...) is rejected so a plugin cannot imitate host messages.

### Latin-1 only

Reader fonts cover Latin-1. The host transliterates **before** counting bytes (`ł` becomes `l`, curly quotes
become `'` and `"`, dashes U+2010-2015 become `-`, `…` becomes `...`, thin and narrow spaces become a space,
anything else becomes `?`). Dates from `Intl.DateTimeFormat` are covered. Preview your texts with the same rules
so they fit the limits after transliteration.

### Line breaks

The reader wraps text at spaces and punctuation such as `,`, `-`, `.` and `_`, but never after `:` or `)`, so a
time ("14:25") is never split and a closing parenthesis never starts a line. A hyphen is a break, so a long
hyphenated name wraps there instead of mid-word, and so can a time range ("13:55-" / "14:25") that does not fit its
line. A word longer than the line is still cut. The reader does not balance lines, and a newline in a text is
replaced by a space.

Write each clause as its own `text` node in a `col`, for example "Free until 13:55," and "then reserved by bea
until 14:25", so no single time or note is left alone on a line. About 42 characters fit one line of the details
body (18 px) and of a small (14 px) text beside a countdown. Split a longer clause yourself, for example between a
name and its times: "Reserved by Wolfgang Mohrman" above "13:55-14:25".

### Privacy and language

Public slots (signed-out reader) must not show names of other people. Everything a provider returns during a card
session is user-scoped, in every slot, and so are steps: the host removes it when the card session ends. Which slot
holds a fact follows `ctx.sessionActive`, not privacy. Prefer "Reserved" over names, and first name plus initial
when a name is needed.

Every context carries `ctx.language` (`'en'` or `'de'`). For slot providers it is the reader language, or the card
user's language while a card session is live. For `PreStartContext` and `SessionEndContext` it is the card user's
language on readers and the user's language on the web and API. Host texts such as "Temporarily unavailable" are
localized by the host.

### Pre-start hook

```ts
const preStartHook: PreStartHook = async (ctx) => {
  if (ctx.confirmedStepKeys.includes('tidy-up')) return { decision: 'allow' };
  const de = ctx.language === 'de';
  return {
    decision: 'confirm',
    confirmation: {
      stepKey: 'tidy-up',
      title: de ? 'Vor dem Start' : 'Before you start',
      body: de ? 'Ist die Maschine sauber?' : 'Is the machine clean?',
    },
  };
};
```

One contract drives readers, the web UI, API clients and supervision approval. A hook returns `allow`, `confirm`
or `block`; the `choose` and `info` start steps of the schema are reserved for a later version.

- `allow` starts normally. `block` refuses with `{ code, title, body }`, shown literally to the user (on Lite as
  the red "blocked" flash).
- `confirm` asks the user. Readers show a confirm step, the web UI a dialog, API clients get a typed
  `409 { code: 'CONFIRMATION_REQUIRED', stepId, confirmation }` and retry with `confirmedStepIds: [stepId]`. Your
  hook is called again with `confirmedStepKeys` containing only **your** keys and decides again. Step ids are
  random, single-use and expire (60 s default, 120 s maximum, set with `expiresInSec`); plugins never see them.
- With several plugins any `block` wins; otherwise the confirmations are asked one after the other in host order.
  Each retry sends only the newest step id; the host remembers the earlier confirmations of the same attempt.
- The hook runs after the host's read-only can-start check, so users who would be refused anyway never see a step.
- `ctx.principal` is the starter as a `resourceAccess` principal. For web and API starts it carries the request's
  permissions, so an API token's scope applies; for reader and supervision starts it is the plain user id. Pass it,
  not `ctx.userId`, to `context.resourceAccess` for permission checks inside the hook.
- A takeover is a start for the new user (`action: 'takeover'`). **Stop and emergency stop never go through hooks.**
- **Supervision approval:** a `confirm` there blocks with your reason by default, because the supervisor cannot
  confirm on the requester's behalf.
- A reader with a screen that cannot show the confirmation blocks the start (`CONFIRMATION_UNAVAILABLE`). Readers
  that cannot show the step at all (Attractap Lite, older firmware without reader UI, readers suspended after
  repeated crashes) follow the resource's no-screen policy: `block` (default), `card-confirm` (Lite: a second tap
  by the same user) or `allow-with-warning` (starts without a confirmation). `PluginConfirmation.noScreenPolicy`
  sets your default, admins can override it per resource.

### Start-blocked state

`preStartHook` only answers when somebody presses Start. To let the resource page show the reason **instead of the
Start button**, a plugin also declares the query-side counterpart `startBlockedQuery`:

```ts
const startBlockedQuery: StartBlockedQuery = async (ctx) => {
  const until = await endOfRunningBooking(ctx.resourceId, ctx.userId); // your own lookup
  if (!until) return null; // nothing blocks
  const de = ctx.language === 'de';
  return {
    reason: {
      code: 'RESERVED',
      title: de ? 'Reserviert' : 'Reserved',
      body: de ? 'Von einer anderen Person reserviert.' : 'Reserved by another user.',
    },
    until, // optional Date: the UI shows it and refreshes itself then
  };
};
```

- **Same shape as a block.** `reason` is the `{ code, title, body }` of a `preStartHook` block, with the same limits and
  reserved codes; `until` is optional. Return `null` for "not blocked".
- **Informational only.** The server still runs `preStartHook` for every start, so the hook must keep blocking; a start
  that slips through, or a stale page, ends in the usual error toast. Readers keep using the hook alone.
- **Privacy is yours.** The query runs for the user who looks at the page (`ctx.userId`, with the request's scope in
  `ctx.principal`). The reason is shown to that user as written, so apply your own visibility rules and never name
  somebody the user may not see. When the reason names a person, ask
  `context.resourceAccess.canSeeUsageAttribution(ctx.principal, ctx.resourceId)` instead of keeping your own rule: it is
  the rule core applies to the current user of a machine. The reservations plugin names the holder exactly then, and
  returns nothing for managers, who start through an override confirmation.
- **Keep it cheap.** It runs whenever a resource page with a start button is open (about every 30 seconds per page, plus
  when you invalidate). It has the hook timeout; a timeout, an error or an invalid answer count as "not blocked" and
  never open the pre-start circuit breaker.
- **Live.** Call `context.startBlocked.invalidate({ resourceId })` whenever something that decides the answer changed
  (a booking was created, cancelled, started or ended). The host sends a `resource.start_blocked_changed` live event and
  open pages ask again at once. Viewers who may not follow the resource live still refresh by polling and at `until`.
- The HTTP side is `GET /api/resources/:resourceId/usage/start-blocked`, answering `{ blocked, reason?, until?, plugin? }`
  for the signed-in user.

### Start capacity on shared machines

On a machine with `maxParallelSessions` above 1, a plugin that holds slots back for others (the reservations plugin
does this for running confirmed bookings whose holder has no session yet) declares `startCapacityHook`. `preStartHook` alone cannot do this safely: two
simultaneous starts could both pass and take the same slot.

```ts
const startCapacityHook: StartCapacityHook = async (ctx) => {
  // ctx.scope is the host's start transaction: only read through it
  const held = await countSlotsHeldForOthers(ctx.scope, ctx.resourceId, ctx.userId, ctx.now); // reads your own tables with { scope }
  if (!held) return { heldSlots: 0 };
  return {
    heldSlots: held,
    reason: {
      code: 'RESERVED',
      title: ctx.language === 'de' ? 'Reserviert' : 'Reserved',
      body: ctx.language === 'de' ? 'Alle freien Plätze sind reserviert.' : 'All free slots are reserved.',
    },
  };
};
```

- **When it runs.** Only on shared machines (limit above 1), inside core's serialized start transaction and after
  core's own capacity check. The context carries `sessionLimit`, `occupiedSlots` (sessions and starts in progress, read
  in the same transaction), `usersInSession`, `userId`, `principal`, `action`, `origin`, `confirmedStepKeys`,
  `language` and `now`.
- **`usersInSession`** (`number[]`) lists the users behind `occupiedSlots` (sessions and starts in progress), read in
  the same transaction. Use it to tell whether a holder is already in a session; the hook does not need to query
  core's session table.
- **`action` is always `start`.** Shared machines have no takeover: a start there always adds a session.
- **Core decides.** Return `{ heldSlots, reason? }`. Core refuses the start with your `reason` when
  `occupiedSlots + heldSlots >= sessionLimit`, so simultaneous starts can never take a held slot.
- **Always return a `reason` when your held slots can fill the machine.** Without one core refuses with its generic
  "unavailable" text and audits an invalid result.
- **Only read through `ctx.scope`, never nest `persistence.transaction`.** `ctx.scope` is a `PluginTransactionScope`
  of core's start transaction (read your own tables with `{ scope: ctx.scope }`): never write through it and
  never call `scope.afterCommit` on it. A storage write or `persistence.transaction` inside the hook that does not use
  `ctx.scope` is rejected. Keep the hook to one indexed query.
- **Failures.** A failure, a timeout and an open circuit breaker follow the per-resource, per-plugin failure policy
  (fail open or fail closed, see [Failures and trust](#failures-and-trust)) and are audited.
- Requires `ACCESS_HOOKS`. A plugin that declares it without the permission fails to load. Reading your own tables
  through `ctx.scope` additionally needs `PLUGIN_STORAGE`. Without a registered hook nothing changes.

### After-stop question

`sessionEndHook` runs after a session ended and may return `{ decision: 'choose', choice }` with up to 4
choices. It is advisory: the session is already over. The question is only shown if the user who ended the session
still holds the card session on that reader (not after a takeover or a web/API stop). It is shown for
`choice.expiresInSec` seconds (default 15, maximum 30). On timeout, cancel, disconnect or readers without a screen
`defaultOnTimeout` applies, and `onAnswer` is called with the answer or the default.

All plugins' session-end hooks are called. The first valid question is shown; the other plugins get their
`defaultOnTimeout`.

```ts
const sessionEndHook: SessionEndHook = async (ctx) => ({
  decision: 'choose',
  choice: {
    stepKey: 'cleaned',
    title: ctx.language === 'de' ? 'Aufgeräumt?' : 'Tidied up?',
    body: ctx.language === 'de' ? 'Ist der Arbeitsplatz sauber?' : 'Is the workspace clean?',
    choices: [
      { id: 'yes', label: ctx.language === 'de' ? 'Ja' : 'Yes' },
      { id: 'no', label: ctx.language === 'de' ? 'Nein' : 'No' },
    ],
    defaultOnTimeout: 'no',
    expiresInSec: 20,
    onAnswer: (choiceId) => recordCleanup(ctx.sessionId, choiceId),
  },
});
```

### Failures and trust

- Hooks time out after 1.5 s (3 s maximum). A timeout, an exception and an invalid result (for example a
  confirmation with a bad step key) all count as a hook failure. The default is **fail closed**: the start is
  blocked with "Temporarily unavailable".
- A `block` whose `reason` is invalid (missing, spoofing a core status, or using a host code such as
  `CONFIRMATION_REQUIRED`, `CONFIRMATION_UNAVAILABLE`, `HOOK_UNAVAILABLE`, `STEP_EXPIRED` or `STEP_UNKNOWN`) still
  blocks, even under fail open, with "Temporarily unavailable". It is audited and does not count towards the
  circuit breaker.
- After 5 consecutive failures a circuit breaker opens for that plugin: the failure policy is applied without
  calling the hook, after 60 s the next call goes through as a probe and closes the breaker when it succeeds, and
  an admin alert is raised. Session-end hooks have their own breaker. Admins can clear the alert early, or choose
  "Allow the start" (fail open) per plugin and resource (audited).
- If a plugin with `ACCESS_HOOKS` fails to load, its hooks are not applied and an admin alert is raised.
- A reader that reports a panic reset gets no plugin contributions until an admin clears the alert or 30 minutes
  pass without another panic. Confirmations on that reader follow the no-screen policy meanwhile.
- **Plugins run in-process and unsandboxed.** A synchronous endless loop in a hook cannot be stopped by the timeout.
  The validation protects readers and users from mistakes; it is not a sandbox.

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

See [Permissions](user-management/permissions.md) for the full list of available permission keys.

The host wraps each plugin route in an error boundary and merges it with the
core routes, so a route that throws cannot take down the rest of the app.

### Sidebar entries and groups

Implement `getSidebarItems()` to add links to your plugin's routes. Set `group`
to an existing host group ID such as `devices`, or declare your own group with
`getSidebarGroups()`:

```tsx
import type { PluginSidebarGroup, PluginSidebarItem } from '@attraccess/plugins-frontend-sdk';
import { PlugIcon } from 'lucide-react';

getSidebarGroups(): PluginSidebarGroup[] {
  return [{ id: 'my-plugin-tools', label: 'My Plugin', icon: <PlugIcon size={16} aria-hidden /> }];
}

getSidebarItems(): PluginSidebarItem[] {
  return [{ label: 'Tools', path: '/my-plugin/tools', group: 'my-plugin-tools' }];
}
```

Use stable, nonempty group IDs. Prefix private groups with your plugin's name;
use an agreed ID for groups shared with other plugins. A group has a
`label` and an optional React node `icon`; the host supplies a puzzle icon when
none is provided. Plugin labels are rendered as supplied, so your plugin is
responsible for their translations.

The host checks each entry's target route permissions before displaying it and
hides groups with no visible entries. Declared groups work in the expanded
sidebar, collapsed menus, and mobile navigation. Entries with no group or an
unknown group ID stay at the root. Host groups keep their labels and icons when
a plugin declares the same ID; for duplicate plugin group IDs, the first loaded
plugin's declaration wins and entries share that group.

#### Sharing a group between plugins

Each plugin that needs a shared group should declare it through
`getSidebarGroups()` and reference the same ID in its entries. Declarations with
matching IDs merge into one group, so plugins work alone or together. For example:

```tsx
// In the 3D printer plugin:
getSidebarGroups(): PluginSidebarGroup[] {
  return [{ id: '3d-printer', label: '3D Printers' }];
}

// In the BambuLab plugin:
getSidebarGroups(): PluginSidebarGroup[] {
  return [{ id: '3d-printer', label: '3D Printers' }];
}

getSidebarItems(): PluginSidebarItem[] {
  return [{ label: 'BambuLab', path: '/printers/bambulab', group: '3d-printer' }];
}
```

BambuLab creates **3D Printers** when installed on its own. When the 3D printer
plugin or another printer plugin also declares `3d-printer`, their entries share
the same group. Use consistent labels and icons for shared IDs: the first loaded
declaration supplies the group's metadata.

The host collects all group declarations before placing entries. A plugin may
also reference a group declared only by another plugin, but should declare the
group itself if it needs to work independently. Without any declaration, the
existing root fallback applies.

### Dashboard pins

Users can pin pages to their personal dashboard with the star in the page
header. Plugin pages are pinnable only when the plugin opts in: list the
sidebar paths in `attraccess.dashboardPaths` in `package.json` (or
`main.frontend.dashboardPaths` in `plugin.json`):

```json
"dashboardPaths": ["/my-plugin/tools"]
```

Each path must also be returned by `getSidebarItems()` and `getRoutes()`, made
of plain segments, and outside `/kiosk` and `/dashboard`. The API refuses pins
for paths no active plugin lists. The host shows the star in the first
`PageHeader` from `@attraccess/plugins-frontend-ui` on that page, so render one
as your page title; you need no other code. The page also appears as a small
shortcut tile in your plugin's group of the "Add widget" gallery. The tile uses
your sidebar entry's label and icon, and its route permissions decide whether the
user may open it. When a user loses access, or your plugin is disabled or no
longer lists the path, the card is shown as no longer accessible until the
user removes it.

### Dashboard widgets

Besides pinned pages, users can add **widgets** to their dashboard: tiles with
live content and quick actions, which they pick from the "Add widget" gallery. A plugin offers widgets in two steps.

1. List the widget ids in `attraccess.dashboardWidgets` in `package.json` (or
   `main.frontend.dashboardWidgets` in `plugin.json`). Ids are lowercase
   kebab-case, at most 64 characters, and are stored in users' dashboards, so
   never rename one:

   ```json
   "dashboardWidgets": ["my-plugin-summary"]
   ```

2. Return the widgets the current user may use from `getDashboardWidgets()`:

   ```tsx
   import type { AttraccessFrontendPlugin, PluginDashboardWidget } from '@attraccess/plugins-frontend-sdk';

   export default class MyPlugin implements AttraccessFrontendPlugin {
     private readonly widgetListeners = new Set<() => void>();

     getDashboardWidgets(): PluginDashboardWidget[] {
       return [
         {
           id: 'my-plugin-summary',
           title: 'Summary', // translate it: the host asks again when the language changes
           description: 'What happened today', // one line in the "Add widget" gallery
           icon: <ChartIcon />,
           href: '/my-plugin/summary', // the header links here outside edit mode
           sizes: ['small', 'medium'], // default ['medium']
           defaultSize: 'medium', // default: the first entry of sizes
           group: 'My plugin', // gallery group; default: your plugin's group, titled after the first group a widget names, else the manifest name
           keywords: ['report', 'statistics'], // extra search terms for the gallery
           render: ({ size, isPreview }) => <SummaryWidget size={size} isPreview={isPreview} />,
         },
       ];
     }

     // Optional: call the listeners when the answer of getDashboardWidgets() changes,
     // for example after an async permission check.
     onDashboardWidgetsChange(listener: () => void): () => void {
       this.widgetListeners.add(listener);
       return () => this.widgetListeners.delete(listener);
     }
     // ...
   }
   ```

The host renders the card: its header with your icon and title, the edit
controls and an error boundary. `render()` returns only the body. A body that
throws shows an error inside its card; the rest of the dashboard keeps
working. Set `hasFields: true` when the body holds form fields: the host then
renders the widget on an outlined section instead of a card surface, where
fields would disappear. Outside edit mode the header links to `href`, so do not
repeat an "Open …" link in the body.

#### Sizes

Tiles sit in a grid with a fixed row height, like widgets on a phone home
screen. There are three sizes:

| Size     | Grid cells         |
| -------- | ------------------ |
| `small`  | 1 column × 1 row   |
| `medium` | 2 columns × 1 row  |
| `large`  | 2 columns × 2 rows |

List the sizes your widget supports in `sizes`; users pick one when they add
it and can change it in edit mode. `render()` receives the tile's `size`. A
tile never grows with its content, so show a fixed number of items per size
(for example 1, 3 and 7) instead of measuring, and truncate long text. Content
that still does not fit is clipped. A stored size your widget no longer
supports renders at `defaultSize`.

#### Previews

The "Add widget" gallery shows a live preview of each widget at the selected
size. The host calls `render()` with `isPreview: true` and places the result in
an `inert` frame that is hidden from assistive technology: nothing in it can be
focused or clicked. Load your data as usual, but do not open dialogs, navigate
or start anything (for example a timer that writes, or a request that changes
data) when `isPreview` is set.

#### Older widgets

All new fields are optional. A widget without `sizes` supports `medium` only,
and a `render()` that takes no argument keeps working: it renders at its
default size.

A widget is offered only while your plugin is active, lists its id in the
manifest and returns it from `getDashboardWidgets()`. The API refuses to add
ids that no active plugin lists. A built-in widget id always wins over yours
(the host ignores yours and logs a warning). Return only what the current user
may use, and gate every link and action in the body by the same rule as its
target. Hiding a widget is not access control: any user can pin a declared id,
so your backend endpoints must check access themselves. The host asks again when the user or the language changes and after
`onDashboardWidgetsChange` fires. When a user loses access, or your plugin is
disabled or stops returning the widget, the card shows as no longer accessible
until the user removes it.

The Reservations plugin's `reservations-upcoming` widget
(`apps/plugins/reservations/frontend/src/dashboard/`) is a complete example.

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

| Slot id                   | Where it renders                                                                        | Context                   |
| ------------------------- | --------------------------------------------------------------------------------------- | ------------------------- |
| `mqtt.server.detail`      | MQTT server detail/edit view (extensions section)                                       | `{ mqttServerId }`        |
| `mqtt.server.list.row`    | MQTT server list, badge area next to the server name                                    | `{ mqttServerId }`        |
| `resource.overview`       | Resource detail overview body (resource-level status or controls)                       | `{ resourceId }`          |
| `resource.active-session` | Active-usage panel, directly after the host flow controls                               | `{ resourceId, usageId }` |
| `resource.list.row`       | Resource list row, compact status area                                                  | `{ resourceId }`          |
| `resource.settings`       | Resource settings page, shown to users who may manage the resource (`resources.update`) | `{ resourceId }`          |
| `user.account`            | The signed-in user's own account page                                                   | `{ userId }`              |
| `admin.settings`          | System settings index, only for users with the `system.settings.manage` permission      | `{}`                      |

The slots `resource.settings`, `user.account` and `admin.settings` are rendered as
**titled sections**: set `title` on the contribution (falls back to a generic
plugin title). The constants `RESOURCE_OVERVIEW_SLOT`, `RESOURCE_SETTINGS_SLOT`,
`USER_ACCOUNT_SLOT`, `ADMIN_SETTINGS_SLOT` and the context types
(`ResourceSlotContext`, `UserSlotContext`, `AdminSettingsSlotContext`) are exported
by `@attraccess/plugins-frontend-sdk`. The host only decides **where** a
contribution is shown; your plugin's backend must still enforce permissions on its
own API.

### Translations and language switching

Use the core `useTranslations` hook from `@attraccess/plugins-frontend-ui` with
your plugin's own English and German catalogs. The hook reads the host's active
language and updates mounted plugin pages, drawers and slot contributions when
the user switches language. Plugins do not run language detection or maintain
their own language preference.

```tsx
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

export function DevicesPage() {
  const { t } = useTranslations({ en, de }, { escapeValues: false });
  return <h1>{t('title')}</h1>;
}
```

Include every user-facing label, description, placeholder and accessibility label
in both catalogs. Use `{{name}}` interpolation for dynamic values and `{ one,
many }` messages with `t('key', { count })` for pluralization. Missing German
keys fall back to English. Use the returned `language` for date and number
formatting; keep user-entered names and protocol identifiers intact. For status
messages retained in React state, store the translation key and parameters and
translate during rendering so existing messages also switch language.

For plain React text, `{ escapeValues: false }` preserves names such as `R&D`
without displaying HTML entities; React escapes the text when rendering it. Do
not use this option for translated HTML or `Trans`. For retained local messages,
store `{ key: 'saved', data: { name } }` and render `tMessage(message)`. Literal
server errors passed to `tMessage` are preserved.

**Share `@attraccess/plugins-frontend-ui` through module federation.** Bundling
a private copy creates a separate language store and prevents automatic switching.
The repository's `createPluginFederationConfig` already declares it with
`import: false` and `generate: false`, so remotes always use the host's copy.
External plugin builds must include the same shared entry:

```ts
'@attraccess/plugins-frontend-ui': {
  requiredVersion: '*', import: false, generate: false,
}
```

Declare `@attraccess/plugins-frontend-ui` as a peer dependency (`^2.0.0-0`). Every
SDK 2.0 plugin already requires Attraccess `2.0.0-0` or later in `attraccess.host`
and `attraccessVersion.min`, and those hosts share this module.

### Shared UI components

`@attraccess/plugins-frontend-ui` also ships the host's UI building blocks, so
plugins look and behave like core instead of carrying their own copies:

| Component                                               | Use it for                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `StatusDialog`                                          | Notices (`info`, `success`, `warning`, `error`)                                    |
| `ConfirmableButton`                                     | A button that asks for confirmation in a `StatusDialog` before it runs its action  |
| `TableRowActions`, `TableActionsColumnHeader`           | A table row's actions: ⋮ menu in the last column, headed "Actions"                 |
| `DeleteConfirmationModal`                               | **Deprecated**: use `ConfirmableButton`                                            |
| `StandardModal`, `StandardDrawer`                       | Richer modals and drawers (forms, lists)                                           |
| `Button`                                                | Buttons with a pending spinner                                                     |
| `AlertStatusIcon`, `StatusAlert`                        | Alerts with a status icon                                                          |
| `LabeledSwitch`, `PasswordInput`                        | Switch with label, password field with show/hide                                   |
| `EmptyState`, `TableDataLoadingIndicator`, `PageHeader` | Empty lists, centred loading indicator, page title with actions                    |
| `DateTimeDisplay`, `useDateTimeFormatter`               | Dates and times that follow the user's date/time preferences                       |

Use `StatusDialog` for short notices and confirmations. Only `error` renders a
red (danger) action button; every other status renders a primary one. Escape
calls `onClose`, a click on the backdrop does nothing. Reach for
`StandardModal` only when the dialog needs richer content.

Confirm destructive or irreversible actions with `ConfirmableButton`. It takes
a `label`, an `onConfirm` action, a `status` and the dialog's `confirm` text.
While `onConfirm` runs, the dialog stays open and shows pending; it closes when
the action succeeds and stays open when it throws, so report the error yourself
(for example in a toast). `renderActivator` replaces the default button.

```tsx
<ConfirmableButton
  label={t('revoke')}
  status="error"
  onConfirm={() => revokeKey.mutateAsync(key.id)}
  confirm={{ title: t('revokeTitle'), message: t('revokeMessage', { name: key.name }) }}
/>
```

Give every table with row actions a last column headed
`<TableActionsColumnHeader />` and put a `TableRowActions` in its cells. Each
action has a `label` and an `icon`; `tone: 'danger'` marks destructive ones,
which get their own last section, and `confirm` asks before `onPress` runs:

```tsx
<TableHeader>
  <TableColumn isRowHeader>{t('name')}</TableColumn>
  <TableColumn><TableActionsColumnHeader /></TableColumn>
</TableHeader>
…
<TableRowActions
  itemName={server.name}
  actions={[
    { key: 'edit', label: t('edit'), icon: PencilIcon, onPress: () => edit(server) },
    {
      key: 'delete',
      label: t('delete'),
      icon: Trash2Icon,
      tone: 'danger',
      onPress: () => remove(server.id),
      confirm: { title: t('deleteTitle'), message: t('deleteMessage', { name: server.name }) },
    },
  ]}
/>
```

The `StandardModal` and `StandardDrawer` exports of
`@attraccess/plugins-frontend-sdk` are **deprecated** re-exports of the
components above; import them from `@attraccess/plugins-frontend-ui` instead.

Every Attraccess 2.0 host and `@attraccess/plugins-frontend-ui` 2.0 contain these
components, so the `2.0.0-0` minimum an SDK 2.0 plugin declares anyway is enough.
Components added in a later release need that release: raise `attraccess.host`,
`attraccessVersion.min` and the peer dependency range accordingly.

### Packaging the frontend

Build the frontend as a module federation remote exposing `./plugin`. Its
`shared` list must include every host singleton your plugin **imports at
runtime**, so it reuses the host's copy instead of bundling its own. The host
shares: `react`, `react-dom`, `react-router-dom`, `react-pluggable`,
`@heroui/react`, `lucide-react`, `@tanstack/react-query`,
`@attraccess/plugins-frontend-ui` (including the core translation hooks).

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
  CI's `plugins` job tests and packs every plugin app (selected by that tag), so
  the generic full build skips them. Lint and typecheck no longer exclude plugin
  apps. The exclusions for lint, typecheck and build live in one place,
  `scripts/ci-nx-exclude.mjs`. List the plugin apps any time with:

  ```bash
  pnpm nx show projects --projects=tag:type:plugin
  ```

- **Build recipe:** the esbuild/Vite/npm-pack recipe described above is shared across
  plugin apps via `apps/plugins/scripts/` (`esbuild-backend.mjs`,
  `vite-federation.config.mjs`, `verify-packed-plugin.mjs`). Each plugin's `project.json`
  wires them into nx targets:

  For local development, build and install a plugin into the dev API's plugin
  directory:

  ```bash
  pnpm nx install-dev plugin-shelly
  ```

  This target is available for Shelly, RabbitMQ and WAGO. `install-dev`
  depends on `build` and always copies the resulting `package/` contents into
  `storage/plugins/<manifest-name>/`, replacing the previous local installation
  and removing stale files. It honors `PLUGIN_DIR`, then `STORAGE_ROOT` from the
  environment or workspace `.env`; relative paths resolve from the workspace
  root. Other plugins are preserved. Restart a running API to load the updated
  plugin. Plugin source changes require running `install-dev` again; this target
  does not watch plugin sources.

  | Target           | Produces                                                                       |
  | ---------------- | ------------------------------------------------------------------------------ |
  | `build-backend`  | `package/dist/index.js` (esbuild, CommonJS, host packages externalized)        |
  | `build-frontend` | `package/frontend/remoteEntry.js` (Vite federation remote)                     |
  | `build`          | stages `package.json` and `plugin.json` in `package/` (depends on both builds) |
  | `zip`            | `dist/plugin-<name>.zip` — uploadable in the Plugins UI                        |
  | `pack`           | `dist/*.tgz` — the npm package artifact (depends on `build`)                   |
  | `pack-test`      | validates the packed tarball and loads its backend                             |
  | `publish`        | publishes a new package version to npm                                         |

  ```bash
   # Build and pack a single plugin app:
   pnpm nx pack plugin-rabbitmq
   # Build a ZIP for direct upload through the Plugins UI:
   pnpm nx zip plugin-rabbitmq
  # …or every plugin app at once:
   pnpm nx run-many --target=pack --projects=tag:type:plugin
   # …or build uploadable ZIPs for every plugin app:
   pnpm nx run-many --target=zip --projects=tag:type:plugin
  ```

- **CI:** pull requests test and pack every plugin app. Publishing is decided from what npm has, not
  from the pushed commits (`apps/plugins/scripts/plugin-publish-plan.mjs`). Every published manifest records the
  commit it was built from in `gitHead` (plus `attraccess.publishedCommit` as a fallback). For each plugin the plan
  reads the commit on the channel's dist-tag and publishes only if the plugin's inputs (its own files, the plugin
  SDK libraries, other Nx inputs) changed since then. A plugin that was never published, or has no recorded commit,
  is always published. Changes merged in a failed run are therefore picked up by the next green one, and an older
  run finishing late never moves a tag backwards.
  - **Nightly** (main, once a night after all build, test and hardware gates pass) publishes the `package.json` version
    without its prerelease suffix plus `-nightly.<run>.<attempt>` (e.g. `0.2.0-nightly.1180.1`) under `next`, in
    the same gated outcome as the `nightly-<sha>` image.
  - **Release** publishes the `package.json` version without its prerelease suffix (`0.2.0-alpha.0` becomes
    `0.2.0`) under `latest`. The release checks every planned version before publishing any; if one already
    exists, raise that plugin's major, minor or patch number (changing only the prerelease suffix is not
    enough). After a release, bump the plugin to the next prerelease (e.g. `0.2.1-alpha.0`) so nightlies sort
    above the released version.
  - Nothing publishes to `alpha` any more; existing `alpha` tags are frozen. See
    [Release channels](plugins/installing-plugins.md#release-channels).
  - Preview the plan locally against the real registry with
    `node apps/plugins/scripts/plugin-publish-plan.mjs --channel=next --dry-run` (or `--channel=latest`); add
    `--out=plan.json` for the machine-readable plan.

## See Also

- [Plugins Overview](plugins/overview.md) — What are plugins?
- [Installing Plugins](plugins/installing-plugins.md) — Upload and manage plugins
- [Example plugin source](https://github.com/Attraccess/Attraccess/tree/main/examples/plugin-hello-world) — the `plugin-hello-world` walkthrough code
- [Developer Guide](developer/overview.md) — Attraccess architecture and development
- [API Reference](developer/api-reference.md) — Attraccess REST API

## Live updates

Use the backend SDK's `context.liveUpdates.register` and the frontend SDK's
`usePluginLiveUpdates<T>` to share the host's authenticated live connection.
Its optional `onUnavailable` callback reports topic rejection or transport
interruption. Retain cached values as unavailable until a fresh snapshot arrives;
do not start recurring REST polling. Cleanup and authentication ownership guard
this callback in the same way as `onUpdate` and `onReconnect`.
Declare plugin-local topics, validate identifiers and authorize every subscription
on the backend; do not open a separate SSE or WebSocket for plugin UI updates.
Authorization and source exceptions are redacted by the host. With
`createSharedLiveSampler`, a pending read keeps its per-key guard until settlement
even after final unsubscribe; recreated consumers receive fresh samples.
The host recovers valid same-user credential rotation without clearing queries
and retains the stream across same-batch cleanup/setup. Plugin event payloads
have no local replay.
See [Plugin live updates](https://github.com/Attraccess/Attraccess/blob/main/docs/development/live-updates.md#plugin-live-updates)
for the contract and examples, including reconnection and cleanup.
The [WAGO sampling schedule](https://github.com/Attraccess/Attraccess/blob/main/docs/development/live-updates.md#wago-sampling-schedule)
lists the shared backend intervals for all nine WAGO topics.
