# Persistence Guarantees

<!-- llms-description: The transaction and concurrency contract of the persistence layer, which guarantee is tested where, and which assumptions only hold for a single API instance. -->

This page states what the persistence layer promises, how each promise is tested, and what is **not** promised when more
than one API instance runs. It does not claim horizontal scaling.

## Unit of work

`UnitOfWork` (`apps/api/src/database/unit-of-work.ts`) is the neutral port for atomic writes.

- `run(work)` opens one transaction scope. Everything written through it commits together or not at all.
- A `run` started inside a running scope of the same async flow **joins** it; nothing nests.
- `scope.afterCommit(callback)` runs only after the outermost unit committed, in registration order. It never runs on
  rollback. A failing callback is logged (error class only) and does not undo the commit or stop the others.
- A scope is closed after commit or rollback. Using a closed scope, or a scope that belongs to another unit of work
  (another connection), is rejected with `TransactionScopeError`.
- `runWithRetry` is the sanctioned way to retry database work. It re-runs the outermost unit when the database
  reports a transient failure (busy, write conflict): three attempts by default, never more than ten, with a jittered
  exponential backoff (50 ms base, 1 s cap). It refuses to start inside an open unit, where a retry could not undo the
  parent's writes. The work runs again from the start, so it must not perform external effects. Effects belong in `afterCommit`: only the attempt that committed runs them. Device commands, payment calls,
  MQTT publishes and emails are therefore never replayed by a database retry.

The mail-after-commit pattern for invitations and e-mail changes (ATT-1269) follows the same rule: SMTP is sent after
the commit and compensated if sending fails.

## Guarantees and their tests

| Guarantee                                                                  | Where it is enforced                                                                                                | Test                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No lost update on one account from independent connections                 | Backend transaction isolation (SQLite: one writer, `BEGIN IMMEDIATE`); balance triggers (migration `1759695000000`) | `database/conformance` (`persistence.conformance.test-fixture.ts`, `ports/billing-ledger`), `e2e/migrations/billing-balance-triggers`                                                                                                                                               |
| Independent resources are not forced through an application-wide mutex     | The contract promises isolation per unit only; SQLite's single writer is an adapter detail                          | `conformance/ports`: a read on another connection proceeds while a unit is open, and a queued second writer commits without deadlock. A write on another account during an open unit runs only for fixtures with `concurrentWriters` (not SQLite, which allows one writer per file) |
| Atomic multi-write units, rollback leaves nothing                          | `UnitOfWork`                                                                                                        | `unit-of-work.spec.ts`, `sqlite-unit-of-work.spec.ts`, `conformance`                                                                                                                                                                                                                |
| Post-commit work after commit, never after rollback                        | `UnitOfWork.afterCommit`                                                                                            | same, plus visibility from a second connection                                                                                                                                                                                                                                      |
| Bounded retry without replaying external effects                           | `runWithRetry`                                                                                                      | `conformance`: a real busy error induced from a third connection, classified as `busy`; effects run once                                                                                                                                                                            |
| Duplicate claims on one key: exactly one wins, loser is a unique violation | Unique constraints, `isUniqueViolation`                                                                             | `conformance`                                                                                                                                                                                                                                                                       |
| No duplicate active session or conflicting reservation on one resource     | Usage integrity triggers and partial indexes (migration `1790100000000`), resource lifecycle transactions           | `resources/usage/lifecycle-persistence/*.spec.ts`                                                                                                                                                                                                                                   |
| Audit acknowledgement durability and ordering (ATT-1212)                   | Dedicated audit connection, `database/adapters/audit/audit-storage.ts`                                              | `audit/*.spec.ts`                                                                                                                                                                                                                                                                   |
| Token rotation, logout receipt, SSO revocation atomic and idempotent       | `SessionStore` (SQLite, Valkey)                                                                                     | `conformance/ports/session-store`, `adapters/sessions/sqlite-session-store.persistence.spec.ts`                                                                                                                                                                                     |
| Passkey challenge consumed exactly once                                    | `PasskeyStore` (`DELETE … RETURNING`)                                                                               | `conformance/ports/passkey-store`                                                                                                                                                                                                                                                   |
| Busy database answers 503 and is not counted as a brute-force failure      | `persistence-errors.ts`, session strategy, rate limiters (ATT-1269)                                                 | `session.strategy.spec.ts`, rate-limit specs                                                                                                                                                                                                                                        |

Existing durable-audit, balance, usage-recovery and device-effect tests stay where they are; the conformance suite adds
the engine-independent contract next to them.

## SQLite adapter details

These live only in `apps/api/src/database/sqlite` and in the audit storage connections:

- Transactions begin `IMMEDIATE`, with a busy timeout, so a read-to-write upgrade cannot fail halfway.
- The main connection gives each async flow ownership of its transaction (AsyncLocalStorage) and queues other flows
  first-in first-out (ATT-1269). Statements of other flows wait at most the busy timeout, then fail with `SQLITE_BUSY`.
- Resource lifecycle writes use a dedicated second connection to the same file, one unit at a time.
- The audit service keeps its own connections and PRAGMAs.

Another backend implements the same behavioural contract with its own locking and isolation.

## Single instance versus several replicas

Attraccess is designed and tested as **one API process per database**. With SQLite that is also a hard requirement: the
database is a local file.

Process-local assumptions that a second replica would break:

- The serialization queue and flow ownership of the SQLite adapter (in memory, per process).
- In-memory chains and locks such as the session change queue, reader session handling and plugin upload locks.
- Schedulers, for example the maintenance schedule evaluation (ATT-627), which would run in every replica.
- Live update fan-out and WebSocket sessions, which only reach clients connected to the same process.
- The MQTT client connections and plugin event bus.
- Rate-limit state when Valkey is not configured; with Valkey it is shared.

A shared database would have to provide, instead of process memory: the atomic balance and usage-integrity guarantees
(constraints or triggers), single-winner claims on unique keys, durable audit acknowledgement, atomic session and token
rotation, and a leader or lock for schedulers. Those are not implemented here; PostgreSQL work in ATT-584 and the
scaling follow-ups own them.
