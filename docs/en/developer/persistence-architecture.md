# Persistence Architecture

<!-- llms-description: Who owns database access in Attraccess: neutral models, SQLite schema, backend seam, ports and adapters, the enforced import boundary and ownership per feature area. -->

Attraccess separates business logic, HTTP/WebSocket/MQTT/device contracts and plugin APIs from the database engine.
SQLite is the only working backend and the default. This page describes the structure that lets a second relational
backend (PostgreSQL, tracked in ATT-584) be added by writing adapters, schema and configuration, without rewriting
feature rules or public contracts.

> [!NOTE]
> The separation is introduced incrementally. This page states what is done and which code still depends on the
> ORM (see [Ownership by feature area](#ownership-by-feature-area)). Nothing here claims PostgreSQL support.

## The layers

| Layer                                              | Location                                                                    | May import `typeorm`, drivers, entities? |
| -------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------- |
| Neutral models, enums, constants                   | `libs/application-models` (`@attraccess/application-models`)                | No, never                                |
| Application, domain, HTTP/WebSocket transport      | `apps/api/src/**` (except `database/`)                                      | No (see the baseline below)              |
| Backend seam, ports, error categories              | `apps/api/src/database/backend`, `persistence-errors.ts`, `unit-of-work.ts` | Seam only: types, no queries             |
| SQLite adapter                                     | `apps/api/src/database/sqlite`                                              | Yes                                      |
| SQLite/TypeORM schema (entities, columns, indexes) | `libs/database-entities`                                                    | Yes                                      |
| Released SQLite migrations                         | `apps/api/src/database/migrations`                                          | Yes, frozen                              |

`libs/database-entities` imports from `libs/application-models`, never the other way round. The enums, singleton ids
and the SSO session context type that used to live in the entity files now live in the neutral library. The entity
library re-exports them only because released migrations still import them from there and must not be edited.

## Backend selection

One composition seam, `apps/api/src/database/backend`, selects the engine:

- `DATABASE_TYPE` (default `sqlite`). Any other value fails at startup, before any connection, migration or plugin
  work. The error names the supported values and never echoes a value that does not look like a plain engine name.
- A `DatabaseBackend` bundles the connection options, the entity set, the migration track, the connection factory,
  the interpretation of driver errors and the shutdown of extra connections.
- A **migration track** is one ordered, released history for one engine. SQLite's track keeps the table name
  `migrations` and all released migrations byte for byte. Another engine adds its own track instead of re-using SQLite SQL.

## Neutral error categories

Application code does not read driver error codes. The active backend registers a classifier and the application asks
`isDatabaseBusyError`, `isUniqueViolation` or `isWriteConflict` (`persistence-errors.ts`). The SQLite classifier, which
owns codes such as `SQLITE_BUSY` and the message form of constraint failures, lives in `database/sqlite/sqlite-errors.ts`.

## Unit of work

`UnitOfWork` (`unit-of-work.ts`) is the port for atomic multi-feature writes. See
[Persistence guarantees](developer/persistence-guarantees.md) for its contract and tests.

## Enforced import boundary

`node scripts/check-persistence-boundaries.mjs` (part of `pnpm lint:files`, which CI runs on every pull request and
merge queue) fails when code outside the persistence implementation imports `typeorm`, `@nestjs/typeorm`, `sqlite3`,
`better-sqlite3`, `@attraccess/database-entities` or adapter internals. It covers static imports, type-only imports,
re-exports, dynamic `import()`, `require()`, `import x = require()` and `import('x')` types.

Existing users are recorded per file in `scripts/persistence-boundaries.baseline.json`. The baseline can only shrink:
a new violation fails, and so does a file that no longer needs its entry until the entry is lowered with
`node scripts/check-persistence-boundaries.mjs --update`. The frontend and the neutral libraries can never be listed.
Allowed locations: `libs/database-entities`, `apps/api/src/database` (adapters live in `database/adapters/<area>`), migration folders and real-engine tests (`*.persistence.spec.ts`, `*.integration.spec.ts`, `*.e2e.spec.ts`, `apps/api/src/{e2e,test,__test__,test-utils}`, plugin `acceptance/`). Unit specs that fake repositories stay checked.

## Ownership by feature area

Every area persists through the TypeORM schema in `libs/database-entities`, but only adapters touch it. The boundary
check has an empty baseline: no application, domain or transport file imports `typeorm`, the drivers, the entity
library or adapter internals. "Port" names the application-owned persistence contract; "Adapter" is where its SQLite
implementation lives (`apps/api/src/database/adapters/<area>`).

| Feature area                                                           | Application code                                                | Port                                                                                                             | Adapter                                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Backend selection, connection, migrations, shutdown, transfer          | `database/backend`, `database/sqlite`                           | `DatabaseBackend`                                                                                                | `database/sqlite`                                                   |
| Error categories, transactions, post-commit hooks, bounded retry       | `database/persistence-errors.ts`, `database/unit-of-work.ts`    | `UnitOfWork`, error classifier                                                                                   | `database/sqlite`                                                   |
| Usage sessions (start, end, takeover, recovery), operating intervals   | `resources/usage`, `resources/operating-intervals`              | `UsageSessionStore`, `OperatingTimelineStore`                                                                    | `adapters/usage`, `adapters/operating-intervals`                    |
| Metering                                                               | `resources/metering`                                            | `MeteringStore`                                                                                                  | `adapters/metering`                                                 |
| Billing, payments, balances, SumUp                                     | `billing`                                                       | `BillingLedgerStore`, `BillingConfigurationStore`, `SumUpCredentialStore`                                        | `adapters/billing`                                                  |
| Resources, groups, introductions, introducers, retraining, supervision | `resources/**`                                                  | `ResourceStore`, `ResourceGroupStore`, `ResourceIntroductionStore`, `ResourceIntroducerStore`, `RetrainingStore` | `adapters/resources`                                                |
| Maintenance (records, requests, schedules, evaluation), health, forms  | `resources/maintenances`, `resources/health`, `resources/forms` | `MaintenanceEvaluationStore` and the maintenance, health and form stores                                         | `adapters/resources`                                                |
| Flows, flow nodes, variables, executors                                | `resources/flows`                                               | `FlowGraphStore`, `FlowTriggerStore`, `FlowVariableStore`, `FlowResourceDirectory`, `FlowBillingItemStore`       | `adapters/flows`                                                    |
| Users, invitations, registration, passwords                            | `users-and-auth/users`                                          | `UserStore`                                                                                                      | `adapters/users`                                                    |
| RBAC, permissions, role assignment                                     | `users-and-auth/rbac`                                           | `RbacStore`                                                                                                      | `adapters/users`                                                    |
| Local credentials, TOTP, API tokens, password policy                   | `users-and-auth/auth`, `password-policy`                        | `CredentialStore`, `TotpStore`, `ApiTokenStore`, `PasswordPolicyStore`                                           | `adapters/auth`                                                     |
| Sessions (SQLite and Valkey), passkeys, SSO, rate limiting             | `users-and-auth/auth`                                           | `SessionStore`, `PasskeyStore`, `SsoProviderStore`, `AccountLockoutStore`                                        | `adapters/sessions`, `passkeys`, `sso`, `rate-limiting`             |
| Audit                                                                  | `audit`                                                         | `AuditStore`                                                                                                     | `adapters/audit` (own connection, PRAGMAs, durable acknowledgement) |
| Attractap readers, credentials, cards, crash reports, secure boot      | `attractap`                                                     | `ATTRACTAP_*` stores                                                                                             | `adapters/attractap`                                                |
| Companion devices, MQTT servers                                        | `companion`, `mqtt`                                             | `CompanionDeviceStore`, `MqttServerStore`                                                                        | `adapters/companion`, `adapters/mqtt`                               |
| Messaging, notifications, push, email, templates                       | `messaging`, `notifications`, `push`, `email*`                  | conversation, notification, push, template and recipient stores                                                  | `adapters/messaging`, `notifications`, `push`, `email`              |
| Settings, analytics, CSV export, metrics                               | `settings`, `analytics`, `metrics`                              | `SettingsRows`, `AnalyticsReader`, `CsvExportTemplateStore`, metrics readers                                     | `adapters/settings`, `analytics`, `metrics`                         |
| Projects, system statistics                                            | `projects`, `version`                                           | `ProjectStore`, `ProjectInvitationStore`, `SystemStatsStore`                                                     | `adapters/projects`, `adapters/system`                              |
| Plugin management, plugin SDK                                          | `plugin-system`, `libs/plugins-backend-sdk`                     | plugin persistence host, host data, migrations                                                                   | `adapters/plugins`                                                  |
| Built-in plugins and examples                                          | `apps/plugins/*`, `examples/*`                                  | SDK 2.0 neutral root plus the `/sqlite` engine subpath                                                           | plugin-owned                                                        |
| MCP OAuth clients, grants and tokens                                   | `mcp`                                                           | `McpOAuthStore`                                                                                                  | `adapters/mcp`                                                      |
| Dashboard pins                                                         | `dashboard`                                                     | `DashboardPinStore`                                                                                              | `adapters/dashboard`                                                |
| Bootstrap, shutdown, persistence error filters                         | `main.bootstrap.ts`, `app`, `exceptions`                        | `DatabaseLifecycle`, neutral error categories                                                                    | `database/sqlite`                                                   |
| Seeds, setup scripts, test databases, tooling                          | `apps/api/scripts`, `scripts/*`, `apps/api/src/e2e`             | `DATABASE_TYPE` provider (`apps/api/scripts/lib/database-provider.mjs`), `apps/api/migration-tracks.cjs`         | `database/sqlite`                                                   |
| Frontend                                                               | `apps/frontend`                                                 | none, imports `@attraccess/application-models` only                                                              | n/a                                                                 |

The plugin SDK root has no TypeORM or host entity. The engine-specific surface is the explicit subpath
`@attraccess/plugins-backend-sdk/sqlite`, usable only when the active backend is SQLite and refused with a clear error
otherwise (see [Migrating Plugins to SDK 2.0](plugins/migrating-to-2.md)).

### Known remaining seams

These are accepted limits of this change, not hidden work:

- Real-engine tests and fixtures may use the ORM (see the allowed locations above).
- Some collaborators still accept a raw `EntityManager` next to a `TransactionScope` (`TransactionContext`) while their
  callers move over, for example the audit recorder. Adapters unwrap either form.
- Three small helpers unwrap a scope for adapters (`TransactionHandles`, `TransactionContextResolver`,
  `EntityManagerResolver`). They share one unit of work per connection (`unitOfWorkFor`) and can be merged into one.
- Swagger schemas that documented secret or never-populated fields are now accurate (see below).
- Code added to `main` after this branch was cut (for example the MCP OAuth tables) is not yet behind ports. The
  boundary check fails CI on it until it is.

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
