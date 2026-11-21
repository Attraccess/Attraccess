# Persistence Architecture

<!-- llms-description: Who owns database access in Attraccess: neutral models, PostgreSQL schema, backend seam, ports and adapters, the enforced import boundary and ownership per feature area. -->

Attraccess separates business logic, HTTP/WebSocket/MQTT/device contracts and plugin APIs from the database engine.
PostgreSQL is the only runtime backend. SQLite is import-only: its frozen migrations and a read adapter exist solely to
move an old installation's data into PostgreSQL once (see
[Updating](installation/updating.md#moving-from-sqlite-to-postgresql)). This page describes the structure that keeps
another relational backend possible by writing adapters, schema and configuration, without rewriting feature rules or
public contracts.

> [!NOTE]
> The separation is introduced incrementally. This page states what is done and which code still depends on the
> ORM (see [Ownership by feature area](#ownership-by-feature-area)).

## The layers

| Layer                                                | Location                                                                    | May import `typeorm`, drivers, entities? |
| ---------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------- |
| Neutral models, enums, constants                     | `libs/application-models` (`@attraccess/application-models`)                | No, never                                |
| Application, domain, HTTP/WebSocket transport        | `apps/api/src/**` (except `database/`)                                      | No (see the baseline below)              |
| Backend seam, ports, error categories                | `apps/api/src/database/backend`, `persistence-errors.ts`, `unit-of-work.ts` | Seam only: types, no queries             |
| PostgreSQL adapter                                   | `apps/api/src/database/postgres`                                            | Yes                                      |
| SQLite import (frozen track, read adapter, transfer) | `apps/api/src/database/sqlite`, `apps/api/src/database/transfer`            | Yes, import only                         |
| TypeORM schema (entities, columns, indexes)          | `libs/database-entities`                                                    | Yes                                      |
| Released SQLite migrations (frozen, transfer only)   | `apps/api/src/database/migrations`                                          | Yes, frozen                              |

`libs/database-entities` imports from `libs/application-models`, never the other way round. The enums, singleton ids
and the SSO session context type that used to live in the entity files now live in the neutral library. The entity
library re-exports them only because released migrations still import them from there and must not be edited.

## Backend selection

One composition seam, `apps/api/src/database/backend`, selects the engine:

- `DATABASE_TYPE` (default `postgres`, the only supported value; `sqlite` fails with a message that links to the upgrade docs). Any other value fails at startup, before any connection, migration or plugin
  work. The error names the supported values and never echoes a value that does not look like a plain engine name.
- A `DatabaseBackend` bundles the connection options, the entity set, the migration track, the connection factory,
  the interpretation of driver errors and the shutdown of extra connections.
- A **migration track** is one ordered, released history for one engine. The PostgreSQL track is one baseline
  migration with later PostgreSQL-only migrations. The released SQLite migrations are kept byte for byte but only run on a
  temporary copy during the transfer. Another engine adds its own track instead of re-using PostgreSQL SQL.
- The SQLite data has the shape of the baseline. A PostgreSQL migration after the baseline that adds a table or a column
  also adds it to `database/transfer/sqlite-snapshot-upgrades.ts`, with the value existing rows get, so the transfer
  fills the current schema.

## Neutral error categories

Application code does not read driver error codes. The active backend registers a classifier and the application asks
`isDatabaseBusyError`, `isUniqueViolation` or `isWriteConflict` (`persistence-errors.ts`). The PostgreSQL classifier, which
owns SQLSTATEs such as `40001`, `40P01`, `55P03` and `23505`, lives in `database/postgres/postgres-errors.ts`.

## Unit of work

`UnitOfWork` (`unit-of-work.ts`) is the port for atomic multi-feature writes. See
[Persistence guarantees](developer/persistence-guarantees.md) for its contract and tests.

## Enforced import boundary

`node scripts/check-persistence-boundaries.mjs` (part of `pnpm lint:files`, which CI runs on every pull request and
merge queue) fails when code outside the persistence implementation imports `typeorm`, `@nestjs/typeorm`, `sqlite3`,
`better-sqlite3`, `@attraccess/database-entities` (including their subpaths) or adapter internals. It covers static
imports, type-only imports, re-exports, dynamic `import()`, `require()`, `import x = require()` and `import('x')` types.

Adapter internals are `apps/api/src/database/adapters/**`, `apps/api/src/database/postgres/**` and
`libs/database-entities`. Only Nest composition files (`*.module.ts`) and tests may import them, so application,
domain and transport code reaches persistence through ports alone. `apps/api/src/database/transfer/**` (the SQLite
import at startup) may in addition be imported by the two process entry points, `main.ts` and `main.bootstrap.ts`.

PostgreSQL is the only runtime database. `apps/api/src/database/sqlite/**` exists for the one-way SQLite import: only
the import path (`database/transfer`) and tests may use it, composition files and entry points may not. The removed
SQLite runtime (the process-wide write queue and file lock, `runSerializedTransaction`, the SQLite backend, unit of
work and connection factory) may not return in any file, the persistence folders and tests included; the check reports
those findings separately and never accepts them on the baseline. The neutral seam files in `apps/api/src/database`
(`unit-of-work.ts`, `persistence-errors.ts`, `backend/database-backend.ts`) are checked like application code. The
plugin SDK has no engine subpath any more: plugins cannot import TypeORM, a driver or an entity at all.

Existing users are recorded per file in `scripts/persistence-boundaries.baseline.json`. The baseline can only shrink:
a new violation fails, and so does a file that no longer needs its entry until the entry is lowered with
`node scripts/check-persistence-boundaries.mjs --update`. The frontend and the neutral libraries can never be listed.
Allowed locations: `libs/database-entities`, the engine and adapter folders under `apps/api/src/database`, migration folders and real-engine tests (`*.persistence.spec.ts`, `*.integration.spec.ts`, `*.e2e.spec.ts`, `apps/api/src/{e2e,test,__test__,test-utils}`, plugin `acceptance/`). Unit specs that fake repositories stay checked.

## Ownership by feature area

Every area persists through the TypeORM schema in `libs/database-entities`, but only adapters touch it. The boundary
check has an empty baseline: no application, domain or transport file imports `typeorm`, the drivers, the entity
library or adapter internals. "Port" names the application-owned persistence contract; "Adapter" is where its implementation lives (`apps/api/src/database/adapters/<area>`).

| Feature area                                                           | Application code                                                | Port                                                                                                             | Adapter                                                 |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Backend selection, connection, migrations, shutdown, transfer          | `database/backend`, `database/postgres`                         | `DatabaseBackend`                                                                                                | `database/postgres`                                     |
| Error categories, transactions, post-commit hooks, bounded retry       | `database/persistence-errors.ts`, `database/unit-of-work.ts`    | `UnitOfWork`, error classifier                                                                                   | `database/postgres`                                     |
| Usage sessions (start, end, takeover, recovery), operating intervals   | `resources/usage`, `resources/operating-intervals`              | `UsageSessionStore`, `OperatingTimelineStore`                                                                    | `adapters/usage`, `adapters/operating-intervals`        |
| Metering                                                               | `resources/metering`                                            | `MeteringStore`                                                                                                  | `adapters/metering`                                     |
| Billing, payments, balances, SumUp                                     | `billing`                                                       | `BillingLedgerStore`, `BillingConfigurationStore`, `SumUpCredentialStore`                                        | `adapters/billing`                                      |
| Resources, groups, introductions, introducers, retraining, supervision | `resources/**`                                                  | `ResourceStore`, `ResourceGroupStore`, `ResourceIntroductionStore`, `ResourceIntroducerStore`, `RetrainingStore` | `adapters/resources`                                    |
| Maintenance (records, requests, schedules, evaluation), health, forms  | `resources/maintenances`, `resources/health`, `resources/forms` | `MaintenanceEvaluationStore` and the maintenance, health and form stores                                         | `adapters/resources`                                    |
| Flows, flow nodes, variables, executors                                | `resources/flows`                                               | `FlowGraphStore`, `FlowTriggerStore`, `FlowVariableStore`, `FlowResourceDirectory`, `FlowBillingItemStore`       | `adapters/flows`                                        |
| Users, invitations, registration, passwords                            | `users-and-auth/users`                                          | `UserStore`                                                                                                      | `adapters/users`                                        |
| RBAC, permissions, role assignment                                     | `users-and-auth/rbac`                                           | `RbacStore`                                                                                                      | `adapters/users`                                        |
| Local credentials, TOTP, API tokens, password policy                   | `users-and-auth/auth`, `password-policy`                        | `CredentialStore`, `TotpStore`, `ApiTokenStore`, `PasswordPolicyStore`                                           | `adapters/auth`                                         |
| Sessions (PostgreSQL and Valkey), passkeys, SSO, rate limiting         | `users-and-auth/auth`                                           | `SessionStore`, `PasskeyStore`, `SsoProviderStore`, `AccountLockoutStore`                                        | `adapters/sessions`, `passkeys`, `sso`, `rate-limiting` |
| Audit                                                                  | `audit`                                                         | `AuditStore`                                                                                                     | `adapters/audit` (durable acknowledgement)              |
| Attractap readers, credentials, cards, crash reports, secure boot      | `attractap`                                                     | `ATTRACTAP_*` stores                                                                                             | `adapters/attractap`                                    |
| Companion devices, MQTT servers                                        | `companion`, `mqtt`                                             | `CompanionDeviceStore`, `MqttServerStore`                                                                        | `adapters/companion`, `adapters/mqtt`                   |
| Messaging, notifications, push, email, templates                       | `messaging`, `notifications`, `push`, `email*`                  | conversation, notification, push, template and recipient stores                                                  | `adapters/messaging`, `notifications`, `push`, `email`  |
| Settings, analytics, CSV export, metrics                               | `settings`, `analytics`, `metrics`                              | `SettingsRows`, `AnalyticsReader`, `CsvExportTemplateStore`, metrics readers                                     | `adapters/settings`, `analytics`, `metrics`             |
| Projects, system statistics                                            | `projects`, `version`                                           | `ProjectStore`, `ProjectInvitationStore`, `SystemStatsStore`                                                     | `adapters/projects`, `adapters/system`                  |
| Plugin management, plugin SDK                                          | `plugin-system`, `libs/plugins-backend-sdk`                     | plugin storage (record port), host data, neutral migrations, transactions                                        | `adapters/plugins`                                      |
| Built-in plugins and examples                                          | `apps/plugins/*`, `examples/*`                                  | SDK 2.0 root only: `context.storage` over declared tables, host ports                                            | none: the host's plugin-storage adapter serves them     |
| MCP OAuth clients, grants and tokens                                   | `mcp`                                                           | `McpOAuthStore`                                                                                                  | `adapters/mcp`                                          |
| Dashboard pins                                                         | `dashboard`                                                     | `DashboardPinStore`                                                                                              | `adapters/dashboard`                                    |
| Bootstrap, shutdown, persistence error filters                         | `main.bootstrap.ts`, `app`, `exceptions`                        | `DatabaseLifecycle`, neutral error categories                                                                    | `database/postgres`                                     |
| Seeds, setup scripts, test databases, tooling                          | `apps/api/scripts`, `scripts/*`, `apps/api/src/e2e`             | `DATABASE_TYPE` provider (`apps/api/scripts/lib/database-provider.mjs`), `apps/api/migration-tracks.cjs`         | `database/postgres`                                     |
| Frontend                                                               | `apps/frontend`                                                 | none, imports `@attraccess/application-models` only                                                              | n/a                                                     |

Plugins have no database access. The SDK has no TypeORM, no host entity, no raw SQL and no engine subpath. A plugin
declares tables in a neutral schema and uses the record port; the host's **plugin-storage adapter** maps that port and
the neutral migrations to the active engine (see [Plugin Storage](plugins/plugin-storage.md) and
[Migrating Plugins to SDK 2.0](plugins/migrating-to-2.md)).

### Known remaining seams

These are accepted limits of this change, not hidden work:

- Real-engine tests and fixtures may use the ORM (see the allowed locations above).
- Ports take only a `TransactionScope`. Four adapters still open their own ORM transaction (SSO provider store,
  maintenance schedule store, email template store, maintenance snapshot reader) and hand it to collaborators wrapped as
  `LegacyEngineTransactionScope` (`adapters/common/legacy-engine-transaction.ts`); no port names that type. Moving
  these adapters onto the unit of work removes it.
- Adapters unwrap a scope with a few small helpers (`TransactionHandles`, `TransactionContextResolver`,
  `EntityManagerResolver`, `managerFor`). All resolve through the one global unit of work and can be merged into one.
- The built-in plugins use only the record port, so they run on any engine that has a plugin-storage adapter. The port
  has no joins; plugins read over several of their own tables with several calls.
- Plugin transactions are not queued per host process. A per-plugin advisory lock orders the transactions of one plugin
  (across instances too); core work and other plugins run in parallel.
- Some lifecycle test fixtures build older schemas with `synchronize` on purpose, to test upgrades and recovery from a
  schema before the integrity migrations.
- Swagger schemas that documented secret or never-populated fields are now accurate (see below).

## Contract preservation

HTTP and WebSocket responses keep their shape. When a service stops returning ORM entities it maps explicitly to a DTO.
Swagger and AsyncAPI are regenerated with `api:export-swagger` and `api:export-asyncapi` and compared; generated
clients are not committed.

### Intentional differences from the previous Swagger

Compared with the contract before this change, AsyncAPI is identical and the HTTP contract differs only here:

- `AuthenticationDetail` no longer documents `password`, `totpSecret` and `totpEnabledAt`, and `MqttServer` no longer
  documents `password`. These secrets were never returned; the schema now says so.
- `GET /companion-devices/{id}` answers with `CompanionDeviceDetailDto`. The old response spread the entity and included
  the token hash; it no longer does. `CompanionDevice.resources` lists only the fields that were meaningful.
- `Form` no longer documents `submissions` and `resource`, and `ResourceFlowNode` no longer documents `resource`; the API
  never populated them. Form fields use `FormFieldResponseDto`.
- Users embedded as actors (introducers, introductions, maintenance) use `ResourceActorUserDto` instead of the full
  `User` schema.
- A few properties switch between `type: object` and `allOf`/`$ref` with the same referenced schema.
- `LoadedPluginManifest.permissions` lists `PLUGIN_STORAGE` instead of `DATABASE_ACCESS` (SDK 2.0).
- `LoadedPluginManifest` has a new boolean `refused` (additive): the host refused the plugin at discovery, so it cannot
  be retried, only replaced or deleted. The admin UI hides **Retry** for it and offers **Remove**.
- `RenameCompanionDeviceDto` now documents its required `name`; the old schema was an empty object and the global
  whitelisting pipe stripped the field, so the rename answered 500.

Two undocumented response details also changed; Swagger never described them and no client reads them:

- `PATCH` of an Attractap reader no longer embeds the billing configurations, introducers and introducer users of its
  resources.
- Introduction grant responses no longer carry `{ id }` stubs of their relations.

### Comparing the contract of two commits

`node scripts/compare-api-contracts.mjs <base.json> <head.json>` diffs two generated `swagger.json` or `asyncapi.json`
files and prints only what a client could notice: paths and methods, parameters, request and response bodies, schemas,
properties, required fields, enum values, types and `$ref`s. Descriptions, examples, titles, tags, servers, the
document version and the order of keys are ignored. Each difference is `breaking` (something removed or made
stricter), `changed` (worth a review) or `added`; `--json` prints them as data and `--fail-on-breaking` makes the exit
status 1 when something is breaking.

Generate the two files on the commits to compare and keep them outside the repository (generated contracts are never
committed):

```bash
pnpm nx run api:export-swagger     # dist/apps/api-swagger/swagger.json
pnpm nx run api:export-asyncapi    # dist/apps/api/asyncapi.json
node scripts/compare-api-contracts.mjs /tmp/base/swagger.json dist/apps/api-swagger/swagger.json
```

An empty report means the refactoring left the HTTP and WebSocket contract unchanged.

### Tooling follows the selected backend

Everything that opens a database is routed through `DATABASE_TYPE`, and an unsupported value stops it before anything
is created or changed:

- The migration datasource (`database/datasource.ts`) uses the backend's migration track.
  `apps/api/migration-tracks.cjs` maps each database type to its track directory for the migration build
  (`api:build-migration-datasource`), so `api:migrations-run`, `api:migration-generate` and `api:migration-revert` build
  and run the track of the selected backend. A second backend adds its directory there and its `MigrationTrack`.
- The dev seed (`api:seed-dev`) and `reencrypt-card-keys` use a database provider (`apps/api/scripts/lib/database-provider.mjs`).
  `scripts/setup-dev-dependencies.sh`, `scripts/setup-workspace.sh` and `scripts/create-worktree.sh` validate
  `DATABASE_TYPE` first (`scripts/check-database-type.sh`).
- Tests open databases through `apps/api/src/test-utils/test-database.ts`, which uses the backend's connection factory.

The real-database lifecycle tests live in `apps/api/src/e2e/migrations/migration-lifecycle.e2e.spec.ts` (fresh install,
upgrade from four older release states with data, failure recovery, seeding). The export, import and backup contract
is tested by `database/conformance/transfer.conformance.test-fixture.ts` through `api:test-conformance`.
