# Migrating Plugins to SDK 2.0

<!-- llms-description: What plugin developers must change for Attraccess 2.0: the minimum host version, declared database engines, the new persistence API with before/after code and the refusal of older plugins. -->

Attraccess 2.0 separates plugins from the database engine. This is a breaking change for plugins built for 1.x.

## What the host enforces

- **Minimum host version.** `plugin.json` must declare `attraccessVersion.min` of `2.0.0-0` or higher. For npm plugins
  the lowest version allowed by `attraccess.host` in `package.json` counts. A plugin below that, or without a minimum,
  is refused when it is uploaded, installed or started. The error names the plugin and links this guide. Nothing is
  extracted, installed or migrated, and the database is not touched.
- **Declared engines.** A plugin that stores data (it has a migrations entry or the `DATABASE_ACCESS` permission) must
  declare the engines its persistence supports:

  ```json
  { "persistence": { "backends": ["sqlite"] } }
  ```

  For npm plugins the same object goes into the `attraccess` block of `package.json`. If the host runs an engine that
  is not listed, the plugin is not installed, migrated or started, and no data changes.

- **Permissions are unchanged.** `DATABASE_ACCESS` and the other permissions still gate what a plugin may use. Install,
  start and uninstall migrations and the plugin migration history safeguards work as before.

## Checklist

1. Set `attraccessVersion.min` to `2.0.0-0` (and `attraccess.host` to `^2.0.0-0` for npm packages).
2. Raise the peer dependency and `attraccess.sdk` ranges on `@attraccess/plugins-backend-sdk`, `-frontend-sdk` and
   `-frontend-ui` to `^2.0.0-0`.
3. Add `persistence.backends` if the plugin stores data.
4. Move persistence to the new API (see [Persistence API](#persistence-api)): `sqlitePersistence(context)` instead of `getRepository`/`dataSource`/`runSerialized`, `persistence: { sqlite: { entities } }` instead of `entities`, `hostData` and the neutral models instead of host entities, migration imports from `@attraccess/plugins-backend-sdk/sqlite`.
5. Add `@attraccess/plugins-backend-sdk/sqlite` to your esbuild externals and drop your own `typeorm` dependency.
6. Rebuild and test the plugin against a 2.0 host.

## Persistence API

The SDK root has no TypeORM, `DataSource`, `Repository`, `EntityManager` or host entity classes any more, and there is
no deprecated path. What stored data through the 1.x context now goes through the neutral `context.persistence`, the
read-only `context.hostData` and the explicit engine subpath `@attraccess/plugins-backend-sdk/sqlite`. The subpath
only works while the host runs SQLite; with another engine it throws a `PluginPersistenceBackendError`, and a plugin
whose declared engines exclude the active one is refused before any mutation.

### Your own tables: `getRepository`

```ts
// 1.x
const widgets = context.getRepository(Widget);
```

```ts
// 2.0
import { sqlitePersistence } from '@attraccess/plugins-backend-sdk/sqlite';

const widgets = sqlitePersistence(context).getRepository(Widget);
```

`getRepository` only serves entity classes your plugin registered. Decorators (`Entity`, `Column`, ...) now come from
the same subpath, and the `entities` export of the backend module becomes an engine declaration:

```ts
// 1.x
export default { entities: [Widget], register };
```

```ts
// 2.0
export default { persistence: { sqlite: { entities: [Widget] } }, register } satisfies PluginBackendModule;
```

### Transactions: `runSerialized`

```ts
// 1.x
await context.runSerialized(async (manager) => {
  await manager.getRepository(Widget).save(widget);
  await context.mqtt.publish(1, 'widgets/created', '{}'); // I/O inside the transaction
});
```

```ts
// 2.0
await sqlitePersistence(context).transaction(async (manager, scope) => {
  await manager.getRepository(Widget).save(widget);
  scope.afterCommit(() => context.mqtt.publish(1, 'widgets/created', '{}')); // only after the commit
});
// or backend-neutral, without the SQLite manager:
await context.persistence.transaction(async (scope) => {
  scope.afterCommit(() => notify());
});
```

The rules stay: keep the callback short, no nesting, no core session writes inside. Effects belong in
`scope.afterCommit`, which never runs on rollback.

### `dataSource` is gone

`context.dataSource` no longer exists. Use `sqlitePersistence(context).getRepository(...)`, `.manager` for reads and
`.transaction(...)` for writes. `context.persistence.backend` and `supports('sqlite')` tell you which engine runs.

### Host entities: `User`, `Resource`, `Setting`, `ResourceFlowNode`, ...

Host entity classes are not exported any more, and `getRepository` cannot reach host tables. Use the existing
capabilities and the neutral lookups:

```ts
// 1.x
const row = await context.getRepository(Setting).findOneBy({ parent: 'app', key: 'backend_url' });
const users = await context.getRepository(User).find({ where: { id: In(ids) } });
const nodes = await context.dataSource
  .getRepository(ResourceFlowNode)
  .createQueryBuilder('node') /* ... */
  .getMany();
```

```ts
// 2.0
const url = await context.hostData.settings.getApp('backend_url'); // READ_SETTINGS
const names = await context.hostData.users.getUsernames(ids); // READ_USERS
const nodes = await context.hostData.flows.findNodes({ typePrefix: 'plugin.x.', dataEquals: { controllerId } }); // DATABASE_ACCESS
```

| 1.x                                            | 2.0                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `getRepository(User)` (`READ_USERS`)           | `hostData.users` (`READ_USERS`)                                                                              |
| `getRepository(Resource)` (`ACCESS_RESOURCES`) | `hostData.resources` and `resourceAccess` (`ACCESS_RESOURCES`)                                               |
| `getRepository(Setting)` (`READ_SETTINGS`)     | `hostData.settings` (`READ_SETTINGS`)                                                                        |
| other host tables via `DATABASE_ACCESS`        | `hostData.flows` (`DATABASE_ACCESS`); no access to other host tables                                         |
| `User`, `Resource` entity types                | `PluginUserModel`, `PluginResourceModel` from `@attraccess/application-models` (re-exported by the SDK root) |

Event payloads (`RESOURCE_USAGE_STARTED`, `RESOURCE_USAGE_ENDED`) carry only these neutral fields; tokens and contact
data are not part of them. `AuthenticatedRequest.user` is typed with them: the host may pass more fields at runtime,
but they are not part of the plugin API and can change without notice. `DATABASE_ACCESS` no longer implies `READ_USERS`,
`ACCESS_RESOURCES` or `READ_SETTINGS`: declare each one you use.

### Migrations

```ts
// 1.x
import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';
```

```ts
// 2.0
import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk/sqlite';
```

Install, start and uninstall migrations, the plugin-scoped `plugin_migrations_<name>` history and the replacement
safeguards behave as before; up-migrations and uninstall reverts each run as one transaction. See
[Database Migrations](plugins/database-migrations.md).

### Bundling

Add the subpath to the externals of your backend and migrations builds and drop your own `typeorm` dependency:

```bash
--external:@attraccess/plugins-backend-sdk --external:@attraccess/plugins-backend-sdk/sqlite
```

esbuild does not emit decorator metadata, so give every `@Column` an explicit `type`.

### Start capacity hook

```ts
// 1.x
const held = await countSlotsHeldForOthers(ctx.manager, ctx.resourceId, ctx.userId, ctx.now);
```

```ts
// 2.0
const manager = sqlitePersistence(context).managerOf(ctx.scope);
const held = await countSlotsHeldForOthers(manager, ctx.resourceId, ctx.userId, ctx.now);
```

`ctx.scope` is a `PluginTransactionScope` of the host's start transaction. Read through it only; never start a
transaction inside the hook.

### Frontend SDK

`@attraccess/plugins-frontend-sdk` follows the same split. `AttraccessFrontendPluginAuthData.user` is now a
`PluginUserModel` (`id`, `username`, `locale`, `isDisabled`) instead of the `User` entity. A frontend plugin that read
other user fields, such as `email`, `creditBalance` or `createdAt`, loads them through the API client instead. Install
`@attraccess/plugins-frontend-sdk` and `@attraccess/plugins-frontend-ui` at the same `^2.0.0-0` range.

### Tests

Plugin tests that need a database build the context with
`createSqlitePluginPersistence({ pluginName, connection: () => dataSource, entities })` from the subpath and set it as
`persistence` of their fake context.

The examples under `examples/` and the built-in plugins (Shelly, WAGO, Matter, Reservations, RabbitMQ) show the 2.0
manifest.
