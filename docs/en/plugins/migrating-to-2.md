# Migrating Plugins to SDK 2.0

<!-- llms-description: Migrating plugins to Attraccess 2.0: no database access, host ports instead of host entities, declared tables with neutral migrations and the record port, a porting guide and the refusal rules. -->

Attraccess 2.0 takes the database away from plugins. This is a breaking change for plugins built for 1.x.

**A plugin has no database access.** There is no `DataSource`, `EntityManager`, TypeORM repository, raw SQL, entity
decorator, engine handle or `@attraccess/plugins-backend-sdk/sqlite` subpath, and no way to read a core table. A plugin
gets two things instead:

- **Host ports** for everything the host owns (users, resources, settings, authorization, audit, notifications, hooks,
  events, flows).
- **Plugin storage** for data of its own: tables the plugin _declares_ in a neutral schema, neutral migrations and the
  record port `context.storage`. The host owns the engine, the DDL, the transactions, the migrations and the backups.

Plugins that bring their own persistence (their own connection, driver or ORM) are rejected.

## What the host enforces

- **Minimum host version.** `plugin.json` must declare `attraccessVersion.min` of `2.0.0-0` or higher. For npm plugins
  the lowest version allowed by `attraccess.host` in `package.json` counts. A plugin below that, or without a minimum,
  is refused when it is uploaded, installed or started.
- **No database permission.** `DATABASE_ACCESS` is gone. Data of your own needs `PLUGIN_STORAGE`, which covers your own
  declared tables only.
- **No legacy persistence declaration.** The `persistence.backends` entry and the TypeORM `migrations` entry
  (`main.migrations` / `attraccess.migrations`) are not part of 2.0. Entity classes are not declared anywhere any more;
  a bundle that still imports TypeORM for them is refused by the import scan.
- **Namespace.** Tables are named `plugin_<namespace>_<table>`. Explicit physical and index names are allowed only to
  adopt 1.x tables in version 1. A forbidden name, or a foreign key to a table of another plugin or the core, is
  refused (see [Table and index names](plugins/plugin-storage.md#table-and-index-names)).

A refused plugin is not extracted, installed, registered, migrated or started, and the database is not touched. The
error names the plugin, states the reason and, for most refusals, links this guide (see [Refusals](#refusals)).

## Checklist

1. Set `attraccessVersion.min` to `2.0.0-0` (and `attraccess.host` to `^2.0.0-0` for npm packages).
2. Raise the peer dependency and `attraccess.sdk` ranges on `@attraccess/plugins-backend-sdk`, `-frontend-sdk` and
   `-frontend-ui` to `^2.0.0-0`.
3. Replace host entity access with [host ports](#host-entities-become-host-ports).
4. If the plugin stores data: replace `DATABASE_ACCESS` with `PLUGIN_STORAGE`, remove `persistence.backends` and the
   migrations entry, and [port the entities and migrations](#porting-typeorm-entities-and-migrations).
5. Replace `getRepository`/`dataSource`/`runSerialized` with [`context.storage` and
   `context.persistence.transaction`](#the-record-port-and-transactions).
6. Remove `@attraccess/plugins-backend-sdk/sqlite` from imports and esbuild externals, and drop your own `typeorm`
   dependency.
7. Rebuild and test against a 2.0 host (unit tests with the [in-memory fake](#tests)).

## Host entities become host ports

Host entity classes are not exported any more and no repository can reach a host table. Use the ports:

| 1.x                                            | 2.0                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `getRepository(User)` (`READ_USERS`)           | `hostData.users` (`READ_USERS`)                                                                              |
| `getRepository(Resource)` (`ACCESS_RESOURCES`) | `hostData.resources` and `resourceAccess` (`ACCESS_RESOURCES`)                                               |
| `getRepository(Setting)` (`READ_SETTINGS`)     | `hostData.settings` (`READ_SETTINGS`)                                                                        |
| flow node queries via `DATABASE_ACCESS`        | `hostData.flows` (**`TRIGGER_FLOWS`**), and `context.flows.trigger(...)`                                     |
| audit rows written by hand                     | `context.audit` (the audit port)                                                                             |
| notification rows written by hand              | `context.notifications.dispatch(...)` (`SEND_NOTIFICATIONS`)                                                 |
| session start/end rows, hook transactions      | the hooks (`preStartHook`, `startCapacityHook`, ... with `ACCESS_HOOKS`) and the `RESOURCE_USAGE_*` events   |
| `User`, `Resource` entity types                | `PluginUserModel`, `PluginResourceModel` from `@attraccess/application-models` (re-exported by the SDK root) |

```ts
// 1.x
const row = await context.getRepository(Setting).findOneBy({ parent: 'app', key: 'backend_url' });
const users = await context.getRepository(User).find({ where: { id: In(ids) } });
```

```ts
// 2.0
const url = await context.hostData.settings.getApp('backend_url'); // READ_SETTINGS
const names = await context.hostData.users.getUsernames(ids); // READ_USERS
const nodes = await context.hostData.flows.findNodes({ typePrefix: 'plugin.x.', dataEquals: { controllerId } }); // TRIGGER_FLOWS
```

Event payloads carry only neutral fields; tokens and contact data are not part of them. `DATABASE_ACCESS` never implied
`READ_USERS`, `ACCESS_RESOURCES` or `READ_SETTINGS`: declare each one you use. `hostData.flows` is gated by
`TRIGGER_FLOWS` now, and the hooks by `ACCESS_HOOKS` alone (`startCapacityHook` no longer needs a database permission).

## Porting TypeORM entities and migrations

The result of the port: the physical tables stay where they are, so an upgrading installation keeps all its data.

1. **List your legacy migrations.** Collect the class names (with timestamp suffix) of **every** TypeORM migration the
   last 1.x release shipped, in order, for example `CreateWidgets1700000000000`.
2. **Describe the table layout those migrations produce.** Read the migrations (not the entities: they may have
   drifted) and write one `table(...)` per table with the same columns, types, defaults, nullability, indexes and
   foreign keys. Use `physicalName` for the existing table name, the existing index names, and `column` where the
   column name differs from the field name. These explicit names are allowed only here, in an adopting version 1, and
   must not be [forbidden names](plugins/plugin-storage.md#table-and-index-names). Foreign keys may point to tables of
   your own plugin only; a column that referenced a core table (`userId`, `resourceId`, ...) becomes a plain
   `f.integer()` without a foreign key. A 1.x decimal column cannot be declared as `f.decimal` on an adopted table.
3. **Make version 1 the baseline.** Declare one neutral migration `{ version: 1, ... }` whose steps create exactly that
   layout. Fresh installations run it; existing ones skip it.
4. **Declare the adoption.** Add `adoption: { legacyMigrations: [...] }` with the list from step 1.
5. **Add later changes as version 2, 3, ...** with `step.*` and, if rows must be rewritten, a data step with the record
   port only.
6. **Register** `storage: yourDefinition` on the backend module, delete the `entities`/`persistence` declaration, the
   entity classes, the TypeORM migration classes, `main.migrations` / `attraccess.migrations` and `persistence.backends`.
7. **Replace the code** that used repositories with the record port (see below), and `DATABASE_ACCESS` with
   `PLUGIN_STORAGE` in the manifest.

```ts
// 1.x entity + migration of the plugin "widgets"
@Entity({ name: 'plugin_widgets_items' })
class Widget {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'varchar', name: 'label' }) label!: string;
}
```

```ts
// 2.0 declaration
const items = table({ id: f.id(), label: f.string() }, { physicalName: 'plugin_widgets_items' });

export const widgetStorage = definePluginStorage({
  tables: { items },
  migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('items', items)] }],
  adoption: { legacyMigrations: ['CreateWidgetItems1700000000000'] },
});
```

If a 1.x table name is forbidden, the table cannot be adopted; see
[1.x names the host refuses](plugins/plugin-storage.md#adoption-of-1x-installations).

### The baseline and adoption rule

On the first start of the 2.0 build the host looks at the plugin's legacy migrations table:

- **All** `legacyMigrations` applied: the host records baseline version 1 **without running anything** and continues
  with later versions.
- **None** applied (a fresh installation): version 1 runs as usual.
- **Only some** applied: the plugin is **refused** and nothing is changed. A partial legacy history means the
  database predates the plugin's last 1.x release. The message tells the operator: "Attraccess 2.0 adopts the data of
  plugin "<name>" only from the last 1.x release (1.11). Restore the backup taken before this upgrade, update to
  Attraccess 1.11 and start it once so the plugin's migrations finish, then update to 2.0."

Version 1 must therefore match the legacy result exactly. A mismatch is not detected on adoption, it surfaces later as
a failing query, so compare column by column.

## The record port and transactions

```ts
// 1.x
const widgets = context.getRepository(Widget);
await widgets.update({ id, status: 'pending' }, { status: 'confirmed' });
await context.runSerialized(async (manager) => {
  await manager.getRepository(Widget).save(widget);
  await context.mqtt.publish(1, 'widgets/created', '{}'); // I/O inside the transaction
});
```

```ts
// 2.0
const { widgets } = context.storage.open(widgetStorage);
const changed = await widgets.update({ id, status: 'pending' }, { status: 'confirmed' }); // atomic compare-and-set
await context.persistence.transaction(async (scope) => {
  await widgets.insert(widget, { scope });
  scope.afterCommit(() => context.mqtt.publish(1, 'widgets/created', '{}')); // only after the commit
});
```

The port offers `insert`, `insertMany`, `get`, `find`, `findOne`, `count`, `update` (returns the number of changed rows,
checked atomically, so it is a compare-and-set), `delete`, `upsert` and `aggregate`, with structured filters (`eq`,
`ne`, `in`, `notIn`, `lt`, `lte`, `gt`, `gte`, `between`, `isNull`, `startsWith`, `and`, `or`, `not`). Errors are the
neutral `PluginStorageUniqueViolation`, `PluginStorageConflict`, `PluginStorageNotFound` and `PluginStorageInvalid`
instead of driver errors. Details: [Plugin Storage](plugins/plugin-storage.md).

Porting notes:

- **No joins.** Query your own tables one after another, and use `in` filters instead of one query per row.
- **No query builder, no raw SQL.** Express aggregates with `aggregate`, counters with `increment(n)` and locks with
  compare-and-set `update`.
- **Timestamps** are `Date` in and out (UTC), **decimals** are strings, JSON fields hold any JSON value.
- **Transactions.** Pass `{ scope }` to every call that must take part; a write without it inside `work` is rejected.
  Effects go into `scope.afterCommit`. The host orders transactions or fails one with `PluginStorageConflict`; it
  does not retry for you. The rules (short callback, no nesting, no core session writes inside) are unchanged.
- `context.persistence` has only `transaction`. `persistence.backend`, `supports(...)` and every engine seam are gone.

### Start capacity hook

```ts
// 1.x
const held = await countSlotsHeldForOthers(ctx.manager, ctx.resourceId, ctx.userId, ctx.now);
```

```ts
// 2.0
const slots = await heldSlots.find({ where: { resourceId: ctx.resourceId } }, { scope: ctx.scope });
```

`ctx.scope` is the host's start transaction: read through it only, never start a transaction inside the hook.

## Tests

Plugin tests do not need a database. Call `createInMemoryPluginStorage(definition)` from the SDK root and put its
`storage` and `persistence` into the fake context:
`{ ...fakeContext, storage: fake.storage, persistence: fake.persistence }`. It follows the contract of the record
port: filters, compare-and-set, neutral errors and transaction scopes. See
[Plugin Storage](plugins/plugin-storage.md#_5-testing).

## Bundling

Externalize only `@attraccess/plugins-backend-sdk` in your backend build (the `/sqlite` subpath no longer exists) and
drop your own `typeorm` dependency:

```bash
--external:@attraccess/plugins-backend-sdk
```

There is no migrations bundle any more: the migrations live in your declaration inside the backend entry.

## Refusals

Each refusal happens before any mutation, names the plugin and states the reason. The refusals marked "guide" also end
with a link to this guide; the others describe the fix in their own words.

| Reason                                          | Guide | What the message says                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDK 1.x (no or too low `attraccessVersion.min`) | guide | The plugin targets the SDK 1.x, which this host no longer supports; rebuild it and declare `>= 2.0.0-0`.                                                                                                                                                                                                                  |
| `DATABASE_ACCESS` requested                     | guide | The permission was removed; plugins have no database access; declare `PLUGIN_STORAGE` and use `context.storage`.                                                                                                                                                                                                          |
| Legacy persistence declaration                  | guide | `persistence.backends` or a TypeORM migrations entry is not supported; declare `storage` instead.                                                                                                                                                                                                                         |
| Database import in the backend bundle           | guide | The bundle imports `typeorm`, `@nestjs/typeorm`, `sqlite3`, `better-sqlite3`, `node:sqlite`, `pg`, `mysql2`, `@attraccess/plugins-backend-sdk/sqlite` or `@attraccess/database-entities`; the message names the module and the bundle file.                                                                               |
| Database handle requested at runtime            | guide | `context.get('DataSource')` (or the entity manager, a repository token) throws: the host connection is not available; use `context.storage`.                                                                                                                                                                              |
| Storage without `PLUGIN_STORAGE`                |       | The plugin declares storage but not the `PLUGIN_STORAGE` permission.                                                                                                                                                                                                                                                      |
| Forbidden or explicit name, foreign key         |       | A physical or index name is declared outside an adopting version 1, a name is a core table, uses a reserved prefix or lies in another installed plugin's namespace, or a foreign key points outside the plugin's own tables.                                                                                              |
| Shared or overlapping namespace                 | guide | Another installed plugin with storage, loaded or not, has the same storage namespace (`foo-bar` and `foo_bar`) or an overlapping one (`wago` and `plugin-wago`, `demo` and `demo-extra`); rename the plugin. At startup a plugin that already keeps committed storage keeps loading and the newcomer is refused.          |
| Invalid migration list                          |       | Versions are not strictly increasing from 1, a step or field is invalid, an adopted table declares `f.decimal`, or a step drops an index that backs a constraint, or a column that is part of an index or key or used by a UNIQUE, CHECK or foreign key constraint (refused when the migration runs; nothing is changed). |
| Partial legacy history                          |       | Attraccess 2.0 adopts the data of the plugin only from the last 1.x release (1.11): restore the backup, update to 1.11, start it once, then update to 2.0. Nothing was changed.                                                                                                                                           |
| Unknown legacy history                          |       | Legacy migrations are applied that this release does not know; update the plugin. Nothing was changed.                                                                                                                                                                                                                    |

The guide link reads `Migration guide: https://docs.attraccess.org/#/en/plugins/migrating-to-2`. Entity classes are not
a declaration of their own any more: they are caught because they import TypeORM.

A refused plugin stays in the plugin list with the error, and its data is left untouched. Deleting it removes its
files without running its code; **its tables stay** in the database. A 2.0 build of the same plugin adopts them later,
or the operator drops them by hand. An exception is the first start after 1.x: the SQLite data moves to PostgreSQL
only when a loadable build of every plugin with data is installed, so operators need your 2.0 build before they
upgrade (see [Plugins with data](installation/updating.md#plugins-with-data)). Publish it before or with Attraccess
2.0.

## Frontend SDK

`@attraccess/plugins-frontend-sdk` follows the same split. `AttraccessFrontendPluginAuthData.user` is now a
`PluginUserModel` (`id`, `username`, `locale`, `isDisabled`) instead of the `User` entity. A frontend plugin that read
other user fields, such as `email`, `creditBalance` or `createdAt`, loads them through the API client instead. Install
`@attraccess/plugins-frontend-sdk` and `@attraccess/plugins-frontend-ui` at the same `^2.0.0-0` range.

The examples under `examples/` and the built-in plugins (Shelly, WAGO, Matter, Reservations, RabbitMQ) show the 2.0
manifest and declared storage.
