// Entity-definition surface re-exported from the host's single TypeORM copy,
// mirroring how plugin-migrations.ts re-exports the schema-builder helpers
// (`Table`, `TableColumn`, …). A plugin authors `@Entity` classes against the
// SDK without taking its own `typeorm` dependency: a bundled copy would be a
// different module object and break decorator-metadata/type identity at load
// time (see apps/api/src/plugin-system/plugin-loader.ts).
//
// An entity a plugin wants to query through `PluginContext.getRepository` must
// also be declared in the plugin's `entities` export so the host can register
// its metadata into the shared DataSource — schema itself stays owned by the
// plugin's migration (the host runs with `synchronize: false`).
export {
  Entity,
  Column,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Index,
  Unique,
} from 'typeorm';

export type { Repository, EntityTarget, ObjectLiteral, FindOptionsWhere } from 'typeorm';

/**
 * Constructor of a TypeORM entity a plugin ships and wants the host to register
 * into the shared DataSource. A plugin lists these as a named `entities` export
 * from its backend entry module; the host collects them at load time so
 * {@link PluginContext.getRepository} resolves their metadata. See
 * `docs/en/plugins/database-migrations.md`.
 */
export type PluginEntityClass = new (...args: never[]) => object;
