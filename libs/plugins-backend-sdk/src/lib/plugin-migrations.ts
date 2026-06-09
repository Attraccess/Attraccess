import type { MigrationInterface } from 'typeorm';

/**
 * Constructor of a TypeORM migration a plugin ships. A plugin's migrations entry
 * module exports one or more of these (either as named exports, mirroring the
 * host's own `migrations/index.ts`, or as a default-exported array). The host
 * collects them and runs them through its migration runner against a
 * plugin-scoped migrations table — see {@link PluginContext} docs and
 * `docs/en/plugins/database-migrations.md`.
 *
 * Author them exactly like host migrations: implement `up`/`down`, prefix the
 * class name with a millisecond timestamp so ordering is deterministic
 * (`class CreateWidgets1700000000000 implements MigrationInterface`).
 */
export type PluginMigrationClass = new () => MigrationInterface;

// Re-exported from the host's single TypeORM copy so a plugin can author
// migrations against the SDK without taking its own `typeorm` dependency (a
// bundled copy would be a different module object — see plugin.module loader).
export type { MigrationInterface, QueryRunner } from 'typeorm';
export { Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';
