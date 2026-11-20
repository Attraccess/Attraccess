# Adding a Database Backend

<!-- llms-description: How the PostgreSQL backend is structured and the exact steps to add another relational backend to Attraccess, including the export, import and backup contract that the SQLite transfer implements. -->

PostgreSQL is the implemented backend and the only one that runs. SQLite is **import-only**: its released migrations
are frozen and run only on a temporary copy during the one-time [transfer to PostgreSQL](installation/updating.md#moving-from-sqlite-to-postgresql).
This page lists what a further backend has to provide so that no feature rule and no public contract has to change,
using the PostgreSQL backend (`apps/api/src/database/postgres`) as the reference.

## Steps

1. **Declare the type.** Add the value to `SUPPORTED_DATABASE_TYPES` in `database/backend/database-backend.ts` and to the
   `DatabaseBackend` registry in `resolve-database-backend.ts`. Until then `DATABASE_TYPE` fails at startup.
2. **Write the adapter** in `apps/api/src/database/<engine>/`: connection options and pooling, the connection factory,
   the error classifier (`PersistenceErrorClassifier`: busy, conflict, unique and foreign key violations; PostgreSQL maps SQLSTATEs `40001`, `40P01`, `55P03`, `57014`, `23505`, `23503`), shutdown of
   extra connections, and a `UnitOfWork` built with `ScopedUnitOfWork`.
3. **Write the schema** next to the entities: engine-specific column types, generated columns (for example the usage
   duration expression), indexes, partial indexes, constraints and triggers or
   their equivalent for balance maintenance and usage integrity.
4. **Add a migration track.** Never run another engine's migrations. Create a new ordered track
   (`MigrationTrack`) with its own migrations table and register its directory in `apps/api/migration-tracks.cjs`, which
   selects the track for the migration build by `DATABASE_TYPE`. The PostgreSQL track is one baseline migration in
   `apps/api/src/database/postgres/migrations`, and later migrations are PostgreSQL-only. The released SQLite
   migrations (`apps/api/src/database/migrations`) are frozen and never changed.
5. **Wire seeding and tooling** to the selected backend: add a provider to `apps/api/scripts/lib/database-provider.mjs`
   (dev seed, `reencrypt-card-keys`), keep `scripts/check-database-type.sh` and the migration Nx targets selecting by
   `DATABASE_TYPE`, and let `apps/api/src/test-utils/test-database.ts` open the new engine.
6. **Provide persistence ports.** For each feature area still on the baseline, introduce an application-owned port and an
   adapter, then lower `scripts/persistence-boundaries.baseline.json`. Adapters share TypeORM code where behaviour is
   identical and isolate real differences.
7. **Add a conformance fixture.** Implement `BackendFixture` (`database/conformance/backend-fixture.ts`) for the engine and
   run `describePersistenceConformance` against it. Every case uses independent connections.
8. **Provide the plugin-storage adapter.** Plugins have no engine-specific code and declare no engines: they use the
   neutral record port and neutral migrations. For the new engine implement the adapter that serves the port (insert,
   insertMany, get, find, findOne, count, update as compare-and-set, delete, upsert, aggregate, the structured filters,
   neutral errors, transaction scopes with `afterCommit`) and the **DDL generator** that turns each neutral migration
   step (`createTable`, `dropTable`, `addColumn`, `dropColumn`, `renameColumn`, `addIndex`, `dropIndex`) into DDL for
   the engine, including the physical type mapping (decimals exact, timestamps UTC, `date`, `json`, `uuid`), generated
   keys, namespacing and the adoption baseline. Run the plugin-storage conformance suite against it.
9. **Document operations**: configuration, backup and restore for the engine (for PostgreSQL see [Environment Variables](installation/environment-variables.md#database) and [Backup & Restore](installation/backup-restore.md)).

## Export, import and backup contract

A transfer or restore, whatever its tooling, must preserve:

- **Identifiers and relationships:** all primary and foreign keys exactly, including generated ids, so relations and
  external references (device enrolment, MQTT ids, audit references) stay valid.
- **Timestamps and time zones:** instants as UTC without loss of precision; the engine converts to and from its own
  representation inside the adapter.
- **Exact monetary and meter values:** billing amounts, balances, price snapshots and meter readings as exact
  decimals or integers, never floating point. Session price snapshots and accepted meter observations are evidence and
  are copied unchanged.
- **Plugin data and plugin schema state:** each plugin's declared tables and its schema state (the applied neutral
  migration version, and for adopted installations the baseline record) are copied together with the plugin version, so
  a restore never has data without the matching schema state.
- **Core migration state:** the core migrations table of the source track. A restored database is only valid with the
  application version that matches its migration state.
- **Derived data:** balances and usage invariants are checked after import by running the engine's integrity checks;
  triggers or equivalent must not double-apply during import.

The SQLite to PostgreSQL transfer implements this contract (`apps/api/src/database/transfer`): the SQLite file is
copied to a working copy, the frozen SQLite track brings the copy to the last SQLite migration, a snapshot is read and
imported into PostgreSQL in one transaction, then integrity checks run. A fresh install and the upgrade from older
migration states with data are tested (`apps/api/src/e2e/migrations`). The contract itself is a neutral
snapshot (`database/transfer-snapshot.ts`: tables, stored columns in neutral kinds, instants as ISO-8601 UTC, integers
beyond 2^53 and decimal text exactly, sequences, core migration state, and per plugin its storage namespace and applied
storage versions) that a backend exports and imports through `DatabaseBackend.transfer`. Plugin columns are typed from
the plugin's storage declaration, not from the engine's column type: decimals as exact text (kind `decimal`), `date` as
`YYYY-MM-DD` (kind `date`), timestamps as ISO-8601 UTC, booleans as booleans. `importSnapshot` takes the target's plugin
descriptors (`{ plugins }`) and refuses a plugin that is missing there or at other storage versions. `describeTransferConformance` (`database/conformance`, run by `api:test-conformance`)
checks it per backend: stable ids and relationships, instants, exact monetary and meter values, plugin tables and
plugin storage versions, core migration state, derived balances not applied twice, and an atomic restore that refuses a
snapshot written for another migration state. A backend adds a `TransferBackendFixture`.

## Not implemented

- Further engines. Nothing in the application depends on PostgreSQL-only behaviour outside the adapters and the
  PostgreSQL track, but no second engine is planned.
- Multi-replica guarantees (scheduler leadership, shared live updates), tracked separately; see
  [Persistence guarantees](developer/persistence-guarantees.md).
