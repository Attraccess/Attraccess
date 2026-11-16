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
Allowed locations: `libs/database-entities`, `apps/api/src/database` and migration folders.

## Ownership by feature area

Every area below persists through the TypeORM schema in `libs/database-entities` today. "Boundary" is the state of the
import check; "Port" is whether an application-owned persistence port exists.

| Feature area                                                                                           | Code                                           | Boundary                              | Port      |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------- | --------- |
| Backend selection, connection, migrations, shutdown                                                    | `database/backend`, `database/sqlite`          | Adapter                               | Seam done |
| Error interpretation (busy, unique, conflict)                                                          | `database/persistence-errors.ts`               | Neutral                               | Done      |
| Transactions, post-commit hooks, bounded retry                                                         | `database/unit-of-work.ts`                     | Neutral                               | Done      |
| Resource access, supervision, usage sessions, operating intervals, metering, maintenance, forms, flows | `resources/**`                                 | Baseline                              | Open      |
| Billing, payments, balances                                                                            | `billing/**`                                   | Baseline                              | Open      |
| Users, auth, RBAC, SSO, passkeys, password policy, rate limiting, sessions, MCP OAuth                  | `users-and-auth/**`                            | Baseline                              | Open      |
| Audit                                                                                                  | `audit/**`                                     | Baseline                              | Open      |
| Attractap readers, credentials, crash reports, secure boot                                             | `attractap/**`                                 | Baseline                              | Open      |
| Companion devices                                                                                      | `companion/**`                                 | Baseline                              | Open      |
| Messaging, notifications, push, email, email templates                                                 | `messaging`, `notifications`, `push`, `email*` | Baseline                              | Open      |
| Settings, analytics, metrics, MQTT, projects, version                                                  | respective folders                             | Baseline                              | Open      |
| Plugin management and plugin SDK                                                                       | `plugin-system/**`, `libs/plugins-backend-sdk` | Baseline                              | Open      |
| Built-in plugins                                                                                       | `apps/plugins/*`                               | Baseline (Matter, Reservations, WAGO) | Open      |
| Frontend                                                                                               | `apps/frontend`                                | Clean                                 | n/a       |

The authoritative, current list is `scripts/persistence-boundaries.baseline.json`.

## Contract preservation

HTTP and WebSocket responses keep their shape. When a service stops returning ORM entities it maps explicitly to a DTO.
Swagger and AsyncAPI are regenerated with `api:export-swagger` and `api:export-asyncapi` and compared; generated
clients are not committed.
