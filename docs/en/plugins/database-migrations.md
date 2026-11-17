# Plugin Database Migrations
<!-- llms-description: How a plugin ships SQL migrations for its own tables through the SDK sqlite subpath: declaring, writing and bundling the migrations entry, rollback semantics and the engine gate. -->

A plugin that needs its own persistent tables ships **migrations** (SQLite today, written
with the helpers of `@attraccess/plugins-backend-sdk/sqlite`) and
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

Migrations are engine-specific. The plugin declares the engines its storage supports in
`persistence.backends` of `plugin.json` (for example `["sqlite"]`). The host checks that declaration before it
installs, starts or migrates the plugin: a plugin whose engines do not include the one the host runs is refused
**before any mutation**, so no table is created and no history row is written.

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
  "main": {
    "backend": { "directory": "dist", "entryPoint": "index.js" },
    "migrations": { "directory": "dist", "entryPoint": "migrations.js" }
  },
  "attraccessVersion": { "min": "2.0.0-0" },
  "persistence": { "backends": ["sqlite"] },
  "permissions": ["DATABASE_ACCESS"]
}
```

`directory` + `entryPoint` are resolved relative to the ZIP root, exactly like
`main.backend`. The entry is loaded independently of the backend module, so the
host can revert your migrations on uninstall even if the backend itself failed to
load.

## 2. Write the migrations

Author them exactly like host migrations. Prefix the class name with a
millisecond timestamp so ordering is deterministic, and implement both `up` and
`down`:

```ts
import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk/sqlite';

export class CreateWidgets1700000000000 implements MigrationInterface {
  name = 'CreateWidgets1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "plugin_widgets" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "label" varchar NOT NULL
      )`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "plugin_widgets"`);
  }
}
```

> [!TIP]
> Import `MigrationInterface`, `QueryRunner`, and the schema-builder helpers
> (`Table`, `TableColumn`, `TableForeignKey`, `TableIndex`) from
> `@attraccess/plugins-backend-sdk/sqlite`. The SDK root has no TypeORM surface;
> this subpath re-exports the host's single TypeORM copy, so your migration runs
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
ships in the package. Like the backend entry, externalize
`@attraccess/plugins-backend-sdk` and `@attraccess/plugins-backend-sdk/sqlite` so they resolve
to the host's copies at runtime rather than being bundled.

## Lifecycle summary

| Event | What the host does |
|-------|--------------------|
| Plugin installed or upgraded → restart → boot | Checks the manifest gate (SDK 2.0, declared engines), then runs pending up-migrations before plugin code starts, in **one all-or-nothing transaction**. |
| Subsequent boots | Skips already-applied migrations (idempotent). |
| Replacement (upgrade or downgrade) | Blocked when the new bundle does not contain every migration already applied, because running down migrations would discard data. Nothing is changed. |
| Plugin uninstalled | Runs all down-migrations in reverse order in **one transaction**, then drops `plugin_migrations_<name>`. |

Rollback semantics:

- If an up-migration fails, the whole batch is rolled back: none of its tables and none of its history rows stay
  behind, and a fixed version installs from a clean state. The plugin is flagged as failed but never blocks host boot
  or other plugins.
- If a down-migration fails on uninstall, the revert is rolled back as a whole: data and history stay intact and the
  error is logged. The plugin files are still removed (its tables may then be orphaned).
- The history of every plugin lives in its own table, `plugin_migrations_<name>`, separate from the host's
  `migrations` table and from other plugins.

## See Also

- [Developing Plugins](plugins/developing-plugins.md)
- [Installing Plugins](plugins/installing-plugins.md)
