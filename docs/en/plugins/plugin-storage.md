# Plugin Storage

<!-- llms-description: How a plugin keeps data of its own without database access: declaring tables, shipping neutral migrations, using the record port context.storage, transactions, errors and test fakes. -->

A plugin has **no database access**. It cannot open a connection, run SQL, use TypeORM or reach a core table. What it
needs for data of its own, it _declares_: tables in a backend-neutral schema, neutral migrations for them and, at
runtime, the **record port** `context.storage`. The host owns the engine, the DDL, the transactions, the migration
bookkeeping and the backups, and stays free to run another engine.

> [!TIP]
> Storage is optional. A plugin that stores nothing, or reads only what the host ports offer (`hostData`,
> `resourceAccess`), declares nothing and needs no permission for it.

Coming from 1.x? Read [Migrating Plugins to SDK 2.0](plugins/migrating-to-2.md) first; it ports TypeORM entities and
migrations to this model step by step.

## Overview

| Piece        | What it is                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Permission   | `PLUGIN_STORAGE` in `plugin.json`. It covers `context.storage` and `context.persistence` for **own tables** only. |
| Declaration  | `definePluginStorage({ tables, migrations, adoption })`, registered as `PluginBackendModule.storage`.             |
| Record port  | `context.storage.open(definition)` returns one typed API per table.                                               |
| Transactions | `context.persistence.transaction(async (scope) => ...)`; pass `{ scope }` to every call that must join it.        |
| Host         | Generates the DDL, runs the migrations, keeps a schema-state record per plugin, backs up and removes the data.    |

Everything is exported by `@attraccess/plugins-backend-sdk`. There is no engine subpath.

## 1. Declare the tables and migrations

```ts
import { definePluginStorage, f, step, table } from '@attraccess/plugins-backend-sdk';

const widgets = table(
  {
    id: f.id(),
    label: f.string({ length: 120 }),
    ownerUserId: f.integer(), // a core id: a plain integer, never a reference to a core table
    status: f.string().withDefault('pending'),
    note: f.text().optional(),
    createdAt: f.timestamp().withDefault({ now: true }),
  },
  { indexes: [{ name: 'idx_widgets_owner', fields: ['ownerUserId'] }] },
);

export const widgetStorage = definePluginStorage({
  tables: { widgets },
  migrations: [{ version: 1, name: 'create-widgets', steps: [step.createTable('widgets', widgets)] }],
});
```

`tables` is the **head shape**: the layout the migrations produce after the last version. Row and filter types come
from it.

### Fields

| Builder                       | Value type in code  | Notes                                                       |
| ----------------------------- | ------------------- | ----------------------------------------------------------- |
| `f.string({ length })`        | `string`            | Bounded text, default length 255.                           |
| `f.text()`                    | `string`            | Unbounded text.                                             |
| `f.integer()`                 | `number`            | Safe integer.                                               |
| `f.decimal(precision, scale)` | `string`            | Exact decimal as a string such as `"12.50"`; never a float. |
| `f.boolean()`                 | `boolean`           |                                                             |
| `f.timestamp()`               | `Date`              | An instant, UTC, millisecond precision.                     |
| `f.date()`                    | `string`            | Calendar day `"YYYY-MM-DD"` without time zone.              |
| `f.json()`                    | any JSON value      |                                                             |
| `f.uuid()`                    | `string`            | Lowercase canonical UUID.                                   |
| `f.id()` / `f.uuidId()`       | `number` / `string` | Generated primary key (auto-increment or random UUID).      |

Modifiers: `.optional()` allows `null`, `.withDefault(value)` sets a default (use `{ now: true }` for a timestamp set
on creation). Fields with a default, a generated value or `null` are optional on insert. `{ column: 'created_at' }`
sets the host-side column name when it differs from the field name (needed when you adopt an existing table).

`table(fields, { primaryKey, indexes, foreignKeys, physicalName })`: the primary key defaults to the generated field.
Foreign keys may reference **tables of the same plugin** only. Core ids (user, resource, flow node) stay plain
`integer` or `uuid` fields without a foreign key. `physicalName` keeps the name of a table that already exists in
installed databases; without it the host derives `plugin_<plugin>_<logical>`. The host rejects a name outside the
plugin's own namespace, and a name inside the namespace of a longer-named installed plugin (a plugin `demo` may not
use `plugin_demo_extra_notes` while `demo-extra` is installed, because that name belongs to `demo-extra`).

### Neutral migrations

Migrations are versions `1, 2, 3, ...`, strictly increasing. Each has declarative **steps**, optionally followed by a
**data step**:

```ts
migrations: [
  { version: 1, name: 'create-widgets', steps: [step.createTable('widgets', widgets)] },
  {
    version: 2,
    name: 'add-priority',
    steps: [
      step.addColumn('widgets', 'priority', f.integer().withDefault(0)),
      step.addIndex('widgets', { fields: ['priority'] }),
    ],
    data: async ({ tables }) => {
      await tables.widgets.update({ status: 'pending' }, { priority: 1 });
    },
  },
];
```

| Step                                       | Effect            |
| ------------------------------------------ | ----------------- |
| `step.createTable(name, definition)`       | Creates a table.  |
| `step.dropTable(name)`                     | Drops a table.    |
| `step.addColumn(table, field, definition)` | Adds a column.    |
| `step.dropColumn(table, field)`            | Drops a column.   |
| `step.renameColumn(table, from, to)`       | Renames a column. |
| `step.addIndex(table, index)`              | Adds an index.    |
| `step.dropIndex(table, name)`              | Drops an index.   |

The host turns each step into DDL for the engine it runs, in the order given. A **data step** runs after the steps of
its version and receives the record port of your own tables (`tables`) and nothing else: no SQL, no host ports.
Version `1` is the **baseline**: it must describe exactly the layout your first release created.

Each migration runs in one all-or-nothing transaction together with the history record. There are no `down` steps:
the host removes your tables itself on uninstall.

### Adoption of 1.x installations

A plugin that stored data through TypeORM migrations in 1.x lists the class names of **all** its legacy migrations:

```ts
adoption: { legacyMigrations: ['CreateWidgets1700000000000', 'AddNote1710000000000'] },
```

If every listed migration is recorded as applied in the plugin's legacy migrations table, the host records baseline
version 1 **without running anything**: the tables and their data stay in place and later versions continue from there.
If only some of them are applied, the host refuses the plugin and changes nothing. See the porting steps in
[Migrating Plugins to SDK 2.0](plugins/migrating-to-2.md#porting-typeorm-entities-and-migrations).

### Register it

```ts
const plugin: PluginBackendModule = {
  storage: widgetStorage,
  register(context) {
    /* ... */
  },
};
```

## 2. Use the record port

```ts
const { widgets } = context.storage.open(widgetStorage);

const created = await widgets.insert({ label: 'Lathe', ownerUserId: 7 }); // generated id and defaults come back
const mine = await widgets.find({
  where: { ownerUserId: 7, status: { in: ['pending', 'confirmed'] } },
  orderBy: [{ field: 'createdAt', direction: 'desc' }],
  limit: 20,
});
```

`open` only serves the definition your plugin registered as `storage`. Calls never take table names as strings of
other plugins, and there is no way to name a core table.

| Operation                          | Result                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `insert(row)` / `insertMany(rows)` | The stored row(s) with generated keys and defaults.                                                            |
| `get(key)`                         | Row by primary key (a value, or an object for composite keys), or `null`.                                      |
| `find(query)` / `findOne(query)`   | Rows for `{ where, orderBy, limit, offset }`.                                                                  |
| `count(where)`                     | Number of matching rows.                                                                                       |
| `update(where, patch)`             | Number of changed rows. The condition is checked atomically with the write: a **compare-and-set** (see below). |
| `delete(where)`                    | Number of removed rows.                                                                                        |
| `upsert(row, { conflictOn })`      | Inserts, or updates the row with the same values of `conflictOn` (a declared unique key or the primary key).   |
| `aggregate(field, where)`          | `{ min, max, sum, count }` over the matching rows.                                                             |

### Filters

A `where` object combines several fields with AND. A field takes a plain value (equality), `null`, or operators:
`eq`, `ne`, `in`, `notIn`, `lt`, `lte`, `gt`, `gte`, `between: [a, b]`, `isNull`, `startsWith` (text, case-sensitive).
Combine with `{ and: [...] }`, `{ or: [...] }` and `{ not: ... }`. Values use the field types above: `Date` for
timestamps, strings for decimals.

There are **no joins**. Read over several tables with several calls, and use an `in` filter instead of one query per
row (no N+1 on hot paths):

```ts
const bookings = await bookingsTable.find({ where: { day: '2026-01-05' } });
const items = await itemsTable.find({ where: { bookingId: { in: bookings.map((b) => b.id) } } });
```

### Compare-and-set

`update` returns how many rows changed and evaluates its `where` atomically with the write, so it is the primitive for
leases, claims and state machines:

```ts
const won = await bookings.update({ id, status: 'pending' }, { status: 'confirmed' });
if (won === 0) throw new ConflictException('Somebody else got there first');
```

Integer fields also accept `increment(n)` in a patch: `update({ id }, { attempts: increment(1) })` adds atomically.

### Errors

Errors are neutral and identical on every engine; all extend `PluginStorageError` and carry a `code`.

| Error                          | `code`             | Meaning                                                                       |
| ------------------------------ | ------------------ | ----------------------------------------------------------------------------- |
| `PluginStorageUniqueViolation` | `UNIQUE_VIOLATION` | A unique key or the primary key was already taken.                            |
| `PluginStorageConflict`        | `CONFLICT`         | Lost a race or the database was busy. Retrying the whole transaction is safe. |
| `PluginStorageNotFound`        | `NOT_FOUND`        | A required row does not exist.                                                |
| `PluginStorageInvalid`         | `INVALID`          | Undeclared table or field, invalid value or unsupported filter.               |

## 3. Transactions

`context.persistence.transaction(work)` runs `work(scope)` as one atomic, isolated unit. It commits when `work`
resolves and rolls back when it throws. Pass `{ scope }` to every storage call (and to host ports that accept a scope,
such as `hostData.resources.get(id, scope)`) that must take part. A check-then-write sequence inside one transaction
cannot be raced: the host orders the transactions or fails one of them, which rolls back.

```ts
await context.persistence.transaction(async (scope) => {
  const clash = await bookings.count({ day, slot }, { scope });
  if (clash > 0) throw new ConflictException('OVERLAP');
  await bookings.insert({ day, slot, userId }, { scope });
  // Runs only after the commit, never on rollback. A failing callback is logged and does not undo the commit.
  scope.afterCommit(() => context.mqtt.publish(1, 'bookings/created', '{}'));
});
```

Rules:

- Keep `work` short and limited to storage and host-port reads. No HTTP, MQTT, email or other I/O inside; register
  such effects with `scope.afterCommit`.
- Do not nest `transaction` calls: the host rejects it. Pass the `scope` down to helpers.
- A call without `{ scope }` runs in its own short transaction and does **not** see the uncommitted writes of
  `work`. Forget the scope and you read stale data, so pass it consistently.
- Do not await core operations that write (starting or ending a session) inside `work`.
- Transactions are serialized per host process. Exclusion across several API instances needs a lock of your own; the
  reservations plugin runs on a single instance for that reason (see
  [Reservations](plugins/reservations/administration.md#single-instance-operation)).

The scope you get in `startCapacityHook` (`ctx.scope`) is core's own start transaction: read through it with
`{ scope: ctx.scope }`, never write and never call `afterCommit` on it. See
[Start capacity](plugins/developing-plugins.md#start-capacity-on-shared-machines).

## 4. Lifecycle

| Event                              | What the host does                                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install, upgrade, boot             | Validates the declaration, then applies pending migrations (each in one transaction) before plugin code starts. Already applied versions are skipped. |
| Existing 1.x installation          | Adopts the baseline when every `adoption.legacyMigrations` entry is applied; refuses a partial history without changing anything.                     |
| Replacement (upgrade or downgrade) | Blocked when the stored schema state is newer than the bundle's migrations, since going back would discard data. Nothing changes.                     |
| Uninstall                          | Drops the plugin's declared tables and its schema-state record in one transaction. The files are removed even if that fails, and the error is logged. |
| Backup and restore                 | Plugin tables travel with the database backup, together with the plugin's schema state. A restore brings both back as one consistent unit.            |

If a migration fails, the whole version is rolled back (no table, no history row stays), the plugin is flagged as
failed and a fixed version installs from a clean state. A failing plugin never blocks host boot or other plugins.

## 5. Testing

The SDK ships an in-memory implementation of the port. It follows the same contract (filters, compare-and-set,
neutral errors, scopes) and needs no database:

```ts
import { createInMemoryPluginStorage } from '@attraccess/plugins-backend-sdk/testing';

const storage = createInMemoryPluginStorage();
const context = { ...fakeContext, storage };
```

Run your service against it in unit tests. Behaviour that only a real engine can show (locking, large tables) is
covered by the host's conformance tests for the port, so your tests do not need to start a database.

## Refusals

The host refuses a plugin **before any mutation** (nothing is extracted, registered, migrated or started) when its
declaration breaks the rules. The error names the plugin, states the reason and links the
[migration guide](plugins/migrating-to-2.md). Typical reasons:

- the plugin declares no minimum host version of `2.0.0-0` or higher;
- it requests the removed `DATABASE_ACCESS` permission, or uses `context.storage` without `PLUGIN_STORAGE`;
- it still ships a TypeORM migrations entry, `persistence.backends` or entity declarations;
- a table or physical name lies outside the plugin's namespace (or inside that of a longer-named installed plugin),
  or a foreign key points outside the plugin;
- migration versions are not strictly increasing from 1, or a step is invalid;
- an installed database has only part of the `adoption.legacyMigrations` applied.

## See Also

- [Migrating Plugins to SDK 2.0](plugins/migrating-to-2.md)
- [Developing Plugins](plugins/developing-plugins.md)
- [Installing Plugins](plugins/installing-plugins.md)
