# Plugin Database Migrations

A plugin that needs its own persistent tables ships **TypeORM migrations** and
lets the host run them. The host manages the full lifecycle:

- **On load (boot):** pending up-migrations run before any plugin code starts.
- **On uninstall:** the plugin's down-migrations run in reverse order, so its
  tables and data are removed cleanly — no orphaned schema.

This replaces the old workaround of issuing raw `CREATE TABLE IF NOT EXISTS` from
a service's `onModuleInit`, which had no versioning and left tables behind on
uninstall.

> [!TIP]
> Migrations are optional. A plugin that stores nothing — or reads only host
> tables it has permission for — needs no migrations entry.

## How it works

Each plugin's migrations are tracked in their **own** table,
`plugin_migrations_<name>`, separate from the host's `migrations` table and from
every other plugin's. Because the bookkeeping is isolated:

- Plugin migration versions never collide with the host's or another plugin's.
- "Revert everything this plugin created" is well-defined at uninstall — the host
  reverts every row in that plugin's tracking table, then drops the table.

The host runs your migrations on a short-lived, standalone connection pointed at
the **same** database, so your plugin owns its migration set without touching the
host's fixed entity/migration pipeline. Up-migrations are idempotent across
restarts and re-installs: already-applied migrations are skipped.

> [!WARNING]
> Plugin up-migrations may run **before** the host's own migrations on a fresh
> database. A plugin migration must therefore **not** depend on (e.g. add a
> foreign key to) host tables — they may not exist yet. Keep plugin schema
> self-contained. This matches the plugin sandbox boundary.

## 1. Declare the migrations entry

Add `main.migrations` to `plugin.json`, pointing at the bundled module that
exports your migration classes:

```json
{
  "name": "plugin-widgets",
  "version": "1.0.0",
  "persistence": { "contractVersion": 2, "supportedBackends": ["sqlite"] },
  "main": {
    "backend": { "directory": "dist", "entryPoint": "index.js" },
    "migrations": { "directory": "dist", "entryPoint": "migrations.js" }
  },
  "attraccessVersion": { "min": "1.0.0" }
}
```

`directory` + `entryPoint` are resolved relative to the ZIP root, exactly like
`main.backend`. The entry is loaded independently of the backend module, so the
host can revert your migrations on uninstall even if the backend itself failed to
load.

## 2. Write the migrations

Author them exactly like host migrations. Use a class name ending in a
13-digit millisecond timestamp so ordering is deterministic, and implement both `up` and
`down`:

```ts
import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk/adapter';

export class CreateWidgets1700000000000 implements MigrationInterface {
  name = 'CreateWidgets1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "plugin_widgets" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "label" varchar NOT NULL
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "plugin_widgets"`);
  }
}
```

> [!TIP]
> Import `MigrationInterface`, `QueryRunner`, and the schema-builder helpers
> (`Table`, `TableColumn`, …) from `@attraccess/plugins-backend-sdk/adapter`. The SDK
> re-exports them from the host's single TypeORM copy, so your migration runs
> against the same types the host uses — never add your own `typeorm` dependency.
>
> Prefix every table with your plugin name (e.g. `plugin_widgets_*`) to avoid
> clashing with host or other-plugin tables in the shared database.

## 3. Bundle the migrations entry

The migrations entry is a normal CommonJS module exporting the migration classes
— as **named exports** (mirroring the host's `migrations/index.ts`) or as a
**default-exported array**:

```ts
// migrations.ts → bundled to dist/migrations.js
export * from './migrations/1700000000000-create-widgets';
```

Build it alongside your backend (e.g. a second esbuild entry) so `dist/migrations.js`
ships in the package. Like the backend entry, externalize `typeorm` so it resolves
to the host's copy at runtime rather than being bundled.

## Application operations and SQLite adapters

New application code uses `@attraccess/plugins-backend-sdk/v2`; SQLite entity decorators, migrations and implementation types use `/adapter`. A v2 backend exports the same `persistence` declaration as its manifest (npm packages use `attraccess.persistence`). Register only backends that have real implementations. Unsupported combinations fail before schema loading, history inspection, migration or activation. SQLite is the only backend implemented by this release.

Define a small operation contract independently of schema classes:

```ts
// persistence/port.ts
import { pluginOperationToken } from '@attraccess/plugins-backend-sdk/v2';
export interface WidgetOperations {
  labels(): Promise<string[]>;
}
export const WIDGETS = pluginOperationToken<WidgetOperations>('widget labels', ['labels']);
```

Keep schema and queries in the SQLite implementation:

```ts
// persistence/typeorm-adapter.ts
import { Entity, Column, PrimaryGeneratedColumn } from '@attraccess/plugins-backend-sdk/adapter';
import type { Repository } from '@attraccess/plugins-backend-sdk/adapter';
import type { WidgetOperations } from './port';

@Entity({ name: 'plugin_widgets' })
export class Widget {
  @PrimaryGeneratedColumn({ type: 'integer' }) id!: number;
  @Column({ type: 'varchar' }) label!: string;
}
export class SqliteWidgets implements WidgetOperations {
  constructor(private readonly rows: Repository<Widget>) {}
  async labels(): Promise<string[]> {
    return (await this.rows.find({ order: { id: 'ASC' } })).map(({ label }) => label);
  }
}
```

The plugin composition entry joins them:

```ts
import type { PluginBackendModule } from '@attraccess/plugins-backend-sdk/v2';
import type { PluginBackendAdapters } from '@attraccess/plugins-backend-sdk/adapter';
import { WIDGETS } from './persistence/port';
import { Widget, SqliteWidgets } from './persistence/typeorm-adapter';
class WidgetModule {}
export default {
  persistence: { contractVersion: 2, supportedBackends: ['sqlite'] },
  persistenceAdapters: [
    {
      backend: 'sqlite',
      entities: [Widget],
      operations: [{ token: WIDGETS, create: ({ manager }) => new SqliteWidgets(manager.getRepository(Widget)) }],
    },
  ],
  register: () => ({ module: WidgetModule }),
} satisfies PluginBackendModule & PluginBackendAdapters;
```

An application service resolves `context.persistence.resolve(WIDGETS).labels()`. It cannot obtain the adapter's repository or undeclared methods. `DATABASE_ACCESS` is still required. Keep business decisions, external calls and public response filtering outside the adapter; return plain records for operations that expose rows.

The traditional `main.migrations` entry remains authoritative when also declaring adapter migrations. Alternatively, a backend registration can supply its migration classes under `persistenceAdapters[].migrations`. Do not switch a released plugin's migration source or rename its history as part of an application refactor. Preserve entity/table names, migration class names, `plugin_migrations_*` history and existing data; edit schema only through a separately reviewed migration.

Plugins without a persistence declaration retain the legacy root SDK and raw SQLite context. They remain SQLite-only and fail clearly on an unsupported future backend. Keeping this compatibility does not make their application code engine-independent. There is no automatic data conversion or announced removal date.

## Lifecycle summary

| Event                             | What the host does                                                      |
| --------------------------------- | ----------------------------------------------------------------------- |
| Plugin installed → restart → boot | Runs pending up-migrations before plugin code starts.                   |
| Subsequent boots                  | Skips already-applied migrations (idempotent).                          |
| Plugin uninstalled                | Runs down-migrations in reverse, then drops `plugin_migrations_<name>`. |

A failing up-migration flags that plugin as failed but never blocks host boot or
other plugins. A failing down-migration on uninstall is logged; the plugin files
are still removed (its tables may then be orphaned).

## See Also

- [Developing Plugins](plugins/developing-plugins.md)
- [Installing Plugins](plugins/installing-plugins.md)
