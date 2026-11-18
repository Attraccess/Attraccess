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
  { indexes: [{ fields: ['ownerUserId'] }] }, // the host names the index
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
`integer` or `uuid` fields without a foreign key.

### Table and index names

The host names your tables and indexes; you name only the logical tables and fields.

- **Namespace.** A plugin's namespace is its name in lower case with every run of other characters than `a-z` and
  `0-9` replaced by `_`, without leading or trailing `_` (`@example/foo-bar` → `example_foo_bar`). A table without `physicalName` is
  `plugin_<namespace>_<table>`, with the logical name in snake case. Index names are generated from the table and
  fields.
- **Explicit names only for adoption.** `physicalName` and an explicit index `name` are allowed only on tables that
  version 1 creates in a definition that declares `adoption`, to take over the tables of a 1.x release (see
  [Adoption of 1.x installations](#adoption-of-1x-installations)). Anywhere else the declaration is refused.
- **Forbidden names.** A physical name may not be a core table, start with a prefix the host reserves, or lie in the
  namespace of another installed plugin. This works in both directions: a plugin `demo` may not use
  `plugin_demo_extra_notes` while `demo-extra` is installed, and `demo-extra` may not use a name of `demo`.
- **One namespace, one plugin.** Two plugins whose namespaces overlap cannot be installed together: the namespaces
  are equal (`foo-bar` and `foo_bar`), or a table prefix of one starts with a prefix of the other (`demo` and
  `demo-extra`; `wago` and `plugin-wago`, whose short prefix `plugin_wago_` holds every table of `wago`). An upload or
  npm install is refused by name alone against every installed plugin with storage, loaded or not (license-blocked,
  quarantined). Should such a plugin arrive anyway (a folder copied into the plugin directory), a plugin that already
  keeps committed storage keeps loading and the newcomer is refused; when both or neither keep committed storage, the
  plugin whose names lie in the other's namespace is refused, and two plugins with the same namespace are both refused.

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

All pending versions run in **one** all-or-nothing transaction together with their history records: if version 3
fails, version 2 of the same run is rolled back too, and the next start tries both again. There are no `down` steps:
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

Version 1 of an adopting definition names the existing tables and indexes:

```ts
// Plugin "widgets". Its 1.x release created the table plugin_widgets_items with the index idx_widgets_items_owner.
const items = table(
  { id: f.id(), label: f.string(), ownerUserId: f.integer({ column: 'owner_user_id' }) },
  {
    physicalName: 'plugin_widgets_items',
    indexes: [{ name: 'idx_widgets_items_owner', fields: ['ownerUserId'] }],
  },
);

export const widgetStorage = definePluginStorage({
  tables: { items },
  migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('items', items)] }],
  adoption: { legacyMigrations: ['CreateWidgetItems1700000000000'] },
});
```

Limits of adopted tables:

- `f.decimal` is not allowed on an adopted table (1.x stored decimals differently). Keep such a column as it was
  stored, for example `f.string()`, or copy it into a new table (below).
- On SQLite, a later version may not drop a 1.x `UNIQUE` constraint, or a column that a 1.x `UNIQUE` or `CHECK`
  constraint covers: that needs a table rebuild, which the host does not do yet. The migration is refused.
- There is no binary field type. A 1.x `blob` column declared as `f.text()` reads as base64 text; write base64 too.

**1.x names the host refuses.** When a 1.x table name is one of the forbidden names above, the table cannot be
declared, so a 2.0 build can neither read, adopt nor drop it. Contact the Attraccess maintainers before you release
such a plugin. When a 1.x table can be adopted but you want to leave its layout behind, adopt it in version 1, then in
version 2 create a new table (with a derived name), copy the rows over in the data step and drop the adopted table
with `step.dropTable`.

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

- `in` and `notIn` do not take `null`. Match NULL with `isNull` (or `null`), combined through `or` when needed:
  `{ or: [{ note: { in: ['a', 'b'] } }, { note: { isNull: true } }] }`.
- An empty operator object such as `{ status: {} }` is refused (`PluginStorageInvalid`), so a forgotten operator never
  matches everything.
- An empty top-level `where` (`{}`) matches **all rows**. Mind this for `update` and `delete`.
- Filter values are checked against the field's type only (a string for a string field, a `Date` for a timestamp).
  Length, precision or other column limits are checked on writes, not on filters. A decimal finer than the field's
  scale compares exactly: `eq` matches nothing, the range operators compare as written.
- `null` works only with `eq`/`ne` (the same as `isNull`); every other operator refuses it.
- `in: []` matches nothing; `notIn: []` matches every row with a value. Rows without a value (NULL) never match `ne`,
  `notIn`, a comparison, or a `not` around them.
- `and`, `or` and `not` can stand next to field conditions in one object; everything is ANDed. `and: []` is true,
  `or: []` is false.
- Boolean and JSON fields cannot be ordered or compared with `lt`/`gt`/`between`.
- Results come in `orderBy` order, then by primary key ascending (also without `orderBy`), so pages are stable. NULL
  sorts first ascending and last descending.
- `startsWith` is case-sensitive and counts characters (code points).

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

Integer fields also accept `increment(n)` in a patch: `update({ id }, { attempts: increment(1) })` adds atomically;
a NULL value counts as 0. `upsert` needs a value for every `conflictOn` field, and a patch may not change key or
generated fields.

### Errors

Errors are neutral and identical on every engine; all extend `PluginStorageError` and carry a `code`.

| Error                          | `code`             | Meaning                                                                      |
| ------------------------------ | ------------------ | ---------------------------------------------------------------------------- |
| `PluginStorageUniqueViolation` | `UNIQUE_VIOLATION` | A unique key or the primary key was already taken.                           |
| `PluginStorageConflict`        | `CONFLICT`         | Lost a race or the database was busy. The work was rolled back; not retried. |
| `PluginStorageNotFound`        | `NOT_FOUND`        | A required row does not exist.                                               |
| `PluginStorageInvalid`         | `INVALID`          | Undeclared table or field, invalid value or unsupported filter.              |

## 3. Transactions

`context.persistence.transaction(work)` runs `work(scope)` as one atomic, isolated unit. It commits when `work`
resolves and rolls back when it throws. Pass `{ scope }` to every storage call (and to host ports that accept a scope,
such as `hostData.resources.get(id, scope)`) that must take part.

**The contract:** the host either orders concurrent transactions or fails one of them with `PluginStorageConflict`,
which rolls it back. A check-then-write sequence inside one transaction therefore cannot be raced. The host does
**not** retry: keep external effects in `scope.afterCommit`, so the caller can safely run the whole transaction again
after a conflict.

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
- Pass `{ scope }` on every write inside `work`. A write without it is rejected with `PluginStorageInvalid`. Only a
  read without a scope runs outside the transaction, and it does **not** see the uncommitted writes of `work`.
- Do not await core operations that write (starting or ending a session) inside `work`.
- How the host orders transactions is an engine detail. On SQLite it runs them one at a time per host process, so
  exclusion across several API instances needs a lock of your own; the reservations plugin runs on a single instance
  for that reason (see [Reservations](plugins/reservations/administration.md#single-instance-operation)).

The scope you get in `startCapacityHook` (`ctx.scope`) is core's own start transaction: read through it with
`{ scope: ctx.scope }`, never write and never call `afterCommit` on it. Inside a host hook that hands you a host scope,
a write or a `transaction` that does not use that scope is rejected. See
[Start capacity](plugins/developing-plugins.md#start-capacity-on-shared-machines).

## 4. Lifecycle

| Event                              | What the host does                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install, upgrade, boot             | Validates the declaration, then applies all pending migrations in one transaction before plugin code starts. Applied versions are skipped.        |
| Existing 1.x installation          | Adopts the baseline when every `adoption.legacyMigrations` entry is applied; refuses a partial history without changing anything.                 |
| Replacement (upgrade or downgrade) | Blocked when the stored schema state is newer than the bundle's migrations, since going back would discard data. Nothing changes.                 |
| Uninstall                          | Drops the tables of the versions the plugin committed and its schema-state record. The files are removed even if that fails; the error is logged. |
| Backup and restore                 | Plugin tables travel with the database backup, together with the plugin's schema state. A restore brings both back as one consistent unit.        |

If a migration fails, the whole run is rolled back (no table, no history row of that run stays), the plugin is flagged
as failed and a fixed version continues from the last committed state. A failing plugin never blocks host boot or other plugins.

## 5. Testing

The SDK ships an in-memory implementation of the port. It follows the same contract (filters, compare-and-set,
neutral errors, scopes) and needs no database:

```ts
import { createInMemoryPluginStorage } from '@attraccess/plugins-backend-sdk';

const fake = createInMemoryPluginStorage(widgetStorage);
const context = { ...fakeContext, storage: fake.storage, persistence: fake.persistence };
// fake.rows('widgets') returns the committed rows for assertions; fake.reset() empties the tables.
```

Run your service against it in unit tests. Behaviour that only a real engine can show (locking, large tables) is
covered by the host's conformance tests for the port, so your tests do not need to start a database.

## Refusals

The host refuses a plugin **before any mutation** (nothing is extracted, registered, migrated or started) when its
declaration breaks the rules. The error names the plugin, states the reason and links the
[migration guide](plugins/migrating-to-2.md). Typical reasons:

- the plugin declares no minimum host version of `2.0.0-0` or higher;
- it requests the removed `DATABASE_ACCESS` permission, or uses `context.storage` without `PLUGIN_STORAGE`;
- it still ships a TypeORM migrations entry or `persistence.backends`, or its bundle imports TypeORM or a database
  driver;
- a `physicalName` or index name is declared outside an adopting version 1, a physical name is forbidden (see
  [Table and index names](#table-and-index-names)), another installed plugin has the same or an overlapping namespace, or a foreign key
  points outside the plugin;
- migration versions are not strictly increasing from 1, or a step is invalid;
- an installed database has only part of the `adoption.legacyMigrations` applied.

## See Also

- [Migrating Plugins to SDK 2.0](plugins/migrating-to-2.md)
- [Developing Plugins](plugins/developing-plugins.md)
- [Installing Plugins](plugins/installing-plugins.md)
