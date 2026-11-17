// Entity-definition and migration surface re-exported from the host's single TypeORM copy. A plugin authors
// `@Entity` classes and migrations against the SDK without taking its own `typeorm` dependency: a bundled copy would
// be a different module object and break decorator-metadata and type identity at load time (see
// apps/api/src/plugin-system/runtime/module-loader.ts).
//
// An entity a plugin wants to query through `sqlitePersistence(context).getRepository` must be listed in
// `persistence.sqlite.entities` of its backend module so the host can register its metadata into the shared
// connection. The schema itself stays owned by the plugin's migrations (the host runs with `synchronize: false`).
export {
  Brackets,
  Check,
  Column,
  CreateDateColumn,
  DataSource,
  Entity,
  In,
  Index,
  IsNull,
  Not,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  SelectQueryBuilder,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type {
  EntityManager,
  EntityTarget,
  FindOptionsWhere,
  MigrationInterface,
  ObjectLiteral,
  QueryRunner,
  Repository,
} from 'typeorm';

// Appended for plugin test harnesses: they open their own in-memory or file database with the host's TypeORM copy and
// spy on the query builder. Production plugin code uses `sqlitePersistence(context)` instead of a DataSource.

// Appended for plugin test code that inspects entity metadata.
export { getMetadataArgsStorage } from 'typeorm';
