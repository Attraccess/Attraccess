# Adding a Database Backend

<!-- llms-description: Exact steps to add another relational backend to Attraccess, the export, import and backup contract, and the concrete deliverables that remain for PostgreSQL (ATT-584). -->

Only SQLite is implemented. This page lists what a new backend has to provide so that no feature rule and no public
contract has to change. PostgreSQL (ATT-584) is the first intended target; nothing below is a claim that it works.

## Steps

1. **Declare the type.** Add the value to `SUPPORTED_DATABASE_TYPES` in `database/backend/database-backend.ts` and to the
   `DatabaseBackend` registry in `resolve-database-backend.ts`. Until then `DATABASE_TYPE` fails at startup.
2. **Write the adapter** in `apps/api/src/database/<engine>/`: connection options and pooling, the connection factory,
   the error classifier (`PersistenceErrorClassifier`: busy, conflict, unique and foreign key violations), shutdown of
   extra connections, and a `UnitOfWork` built with `ScopedUnitOfWork`.
3. **Write the schema** next to the entities: engine-specific column types, generated columns (for example the usage
   duration expression that SQLite computes with `julianday`), indexes, partial indexes, constraints and triggers or
   their equivalent for balance maintenance and usage integrity.
4. **Add a migration track.** Do not run SQLite migrations on another engine. Create a new ordered track
   (`MigrationTrack`) with its own migrations table and register its directory in `apps/api/migration-tracks.cjs`, which
   selects the track for the migration build by `DATABASE_TYPE`. Released SQLite migrations are never changed.
5. **Wire seeding and tooling** to the selected backend: add a provider to `apps/api/scripts/lib/database-provider.mjs`
   (dev seed, `reencrypt-card-keys`), keep `scripts/check-database-type.sh` and the migration Nx targets selecting by
   `DATABASE_TYPE`, and let `apps/api/src/test-utils/test-database.ts` open the new engine.
6. **Provide persistence ports.** For each feature area still on the baseline, introduce an application-owned port and an
   adapter, then lower `scripts/persistence-boundaries.baseline.json`. Adapters share TypeORM code where behaviour is
   identical and isolate real differences.
7. **Add a conformance fixture.** Implement `BackendFixture` (`database/conformance/backend-fixture.ts`) for the engine and
   run `describePersistenceConformance` against it. Every case uses independent connections.
8. **Declare plugin support.** Plugins list the engines they support in `persistence.backends`; the host refuses a plugin
   that does not list the active engine before installing, migrating or starting it.
9. **Document operations**: configuration, backup and restore for the engine.

## Export, import and backup contract (for ATT-584)

A transfer or restore, whatever its tooling, must preserve:

- **Identifiers and relationships:** all primary and foreign keys exactly, including generated ids, so relations and
  external references (device enrolment, MQTT ids, audit references) stay valid.
- **Timestamps and time zones:** instants as UTC without loss of precision; the engine converts to and from its own
  representation inside the adapter.
- **Exact monetary and meter values:** billing amounts, balances, price snapshots and meter readings as exact
  decimals or integers, never floating point. Session price snapshots and accepted meter observations are evidence and
  are copied unchanged.
- **Plugin data and plugin migration state:** each plugin's tables and its plugin-scoped migrations table are copied
  with the plugin version.
- **Core migration state:** the core migrations table of the source track. A restored database is only valid with the
  application version that matches its migration state.
- **Derived data:** balances and usage invariants are checked after import by running the engine's integrity checks;
  triggers or equivalent must not double-apply during import.

SQLite conformance for this contract: a fresh install, an upgrade from older migration states with data and the
migration track's unchanged table name are tested (`apps/api/src/e2e/migrations`). The contract itself is a neutral
snapshot (`database/transfer-snapshot.ts`: tables, stored columns in neutral kinds, instants as ISO-8601 UTC, integers
beyond 2^53 and decimal text exactly, sequences, core and plugin migration state) that a backend exports and imports
through `DatabaseBackend.transfer`. `describeTransferConformance` (`database/conformance`, run by `api:test-conformance`)
checks it per backend: stable ids and relationships, instants, exact monetary and meter values, plugin tables and
plugin migration state, core migration state, derived balances not applied twice, and an atomic restore that refuses a
snapshot written for another migration state. A backend adds a `TransferBackendFixture`. The cross-engine transfer
command itself is not part of this work.

## Remaining ATT-584 deliverables

- The PostgreSQL adapter, schema, migration track and `docker-compose`/deployment configuration.
- A PostgreSQL fixture for `describePersistenceConformance` and the other engine-parameterised suites, run in CI.
- The SQLite to PostgreSQL transfer command honouring the contract above.
- Ports and adapters for the feature areas still on the baseline (see
  [Persistence architecture](developer/persistence-architecture.md)), and the plugin persistence API for SDK 2.0.
- Multi-replica guarantees (locks, scheduler leadership, shared live updates), tracked separately.
