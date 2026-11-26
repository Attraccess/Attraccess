# Persistence Guarantees

<!-- llms-description: The transaction and concurrency contract of the PostgreSQL persistence layer, which guarantee is enforced and tested where, and which assumptions only hold for a single API instance. -->

This page states what the persistence layer promises on PostgreSQL, how each promise is tested, and what is **not**
promised when more than one API instance runs. It does not claim horizontal scaling.

## PostgreSQL semantics

PostgreSQL is the only runtime backend (SQLite is only read by the one-time [import migration](installation/updating.md#moving-from-sqlite-to-postgresql)).
There is no process-wide write lock: independent transactions run in parallel, and correctness comes from the database.

- **Isolation.** Transactions run at `READ COMMITTED`. Anything that must not interleave is guarded explicitly, not by a
  stricter isolation level.
- **Row locks.** Read-modify-write on one row uses `SELECT … FOR UPDATE`.
- **Advisory locks.** Per-resource work takes `pg_advisory_xact_lock(namespace, resourceId)` and holds it until commit
  or rollback (`adapters/resources/resource-locks.ts`): one namespace for the usage lifecycle (capacity, one session
  per user, takeover reservations) and one for the operating timeline (the one open interval). Other resources and all
  plain reads keep running.
- **Unique constraints and triggers.** Single-winner claims are unique constraints; billing balances, usage integrity
  (no duplicate active session, no conflicting reservation) and audit immutability are enforced by triggers and partial
  indexes in the database, so they hold for every writer.
- **Lock timeout.** Every connection sets `lock_timeout` to 10 s, so a statement that waits for a lock fails instead of
  waiting forever. Time zone is `UTC`.
- **Retries.** A transaction that PostgreSQL aborts with `40001` (serialization failure) or `40P01` (deadlock) is a
  `conflict`; `runWithRetry` runs it again (see below). The usage lifecycle phases (session start and end, staged
  billing items, recovery) and the flow billing node retry this way. External effects are never replayed because they
  run in `afterCommit`.
- **Error classification** (`database/postgres/postgres-errors.ts`): `40001` and `40P01` are conflicts; `55P03` (lock
  not available), `57014` (timeout), `53300` (too many connections), `08xxx` (connection) and `57P01` (admin shutdown)
  are busy, as is a pool that has no free connection within 10 s; `23505` is a unique violation; `23503` a foreign key
  violation; `25006` read-only; `22003`, `22P02`, `22021`, `22007` and `22008` are invalid input. A global exception
  filter answers a busy or conflicting database with `503` and invalid input with `400`, never with the driver
  message.
- **Types.** Points in time are `timestamptz` (UTC). Credits and meter values are `bigint` or exact decimals, never
  floating point.
- **Migrations.** The PostgreSQL track (`apps/api/src/database/postgres/migrations`) is a baseline, the SQLite import
  and later PostgreSQL-only migrations. They run at startup under a PostgreSQL advisory lock, one transaction per
  migration. The released SQLite migrations are frozen and run only inside the import, in place on the SQLite file.

## Unit of work

`UnitOfWork` (`apps/api/src/database/unit-of-work.ts`) is the neutral port for atomic writes.

- `run(work)` opens one transaction scope. Everything written through it commits together or not at all.
- A `run` started inside a running scope of the same async flow **joins** it; nothing nests.
- `scope.afterCommit(callback)` runs only after the outermost unit committed, in registration order. It never runs on
  rollback. A failing callback is logged (error class only) and does not undo the commit or stop the others.
- A scope is closed after commit or rollback. Using a closed scope, or a scope that belongs to another unit of work
  (another connection), is rejected with `TransactionScopeError`.
- `runWithRetry` is the sanctioned way to retry database work. It re-runs the outermost unit when the database
  reports a failure that PostgreSQL rolled back completely (`40001`, `40P01`, `55P03`, `57014`). A lost connection
  (`08xxx`, `57P01`) is not retried: the commit may already have happened. Three attempts by default, never more than ten, with a jittered
  exponential backoff (50 ms base, 1 s cap). It refuses to start inside an open unit, where a retry could not undo the
  parent's writes. The work runs again from the start, so it must not perform external effects. Effects belong in `afterCommit`: only the attempt that committed runs them. Device commands, payment calls,
  MQTT publishes and emails are therefore never replayed by a database retry.

The mail-after-commit pattern for invitations and e-mail changes (ATT-1269) follows the same rule: SMTP is sent after
the commit and compensated if sending fails.

## Guarantees and their tests

| Guarantee                                                                  | Where it is enforced                                                                                                          | Test                                                                                                                                                                               |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No lost update on one account from independent connections                 | Row locks and balance triggers in the PostgreSQL baseline                                                                     | `database/conformance` (`persistence.conformance.test-fixture.ts`, `ports/billing-ledger`), `e2e/migrations/billing-balance-triggers`                                              |
| Independent resources are not forced through an application-wide mutex     | No global mutex: row locks and per-resource advisory locks (`pg_advisory_xact_lock`) only                                     | `conformance/ports`: a read on another connection proceeds while a unit is open, a write on another account runs during an open unit, and a second writer commits without deadlock |
| Atomic multi-write units, rollback leaves nothing                          | `UnitOfWork`                                                                                                                  | `unit-of-work.spec.ts`, `conformance`                                                                                                                                              |
| Post-commit work after commit, never after rollback                        | `UnitOfWork.afterCommit`                                                                                                      | same, plus visibility from a second connection                                                                                                                                     |
| Bounded retry without replaying external effects                           | `runWithRetry`                                                                                                                | `conformance`: a real lock timeout or deadlock induced from another connection, classified as `busy` or `conflict`; effects run once                                               |
| Duplicate claims on one key: exactly one wins, loser is a unique violation | Unique constraints, `isUniqueViolation`                                                                                       | `conformance`                                                                                                                                                                      |
| No duplicate active session or conflicting reservation on one resource     | Usage integrity triggers and partial indexes (PostgreSQL baseline), per-resource advisory locks in the lifecycle transactions | `resources/usage/lifecycle-persistence/*.spec.ts`                                                                                                                                  |
| Audit acknowledgement durability and ordering (ATT-1212)                   | Audit store (`database/adapters/audit`), records immutable by trigger                                                         | `audit/*.spec.ts`                                                                                                                                                                  |
| Token rotation, logout receipt, SSO revocation atomic and idempotent       | `SessionStore` (PostgreSQL, Valkey)                                                                                           | `conformance/ports/session-store`, `adapters/sessions/postgres-session-store.persistence.spec.ts`                                                                                  |
| Passkey challenge consumed exactly once                                    | `PasskeyStore` (`DELETE … RETURNING`)                                                                                         | `conformance/ports/passkey-store`                                                                                                                                                  |
| Busy database answers 503 and is not counted as a brute-force failure      | `persistence-errors.ts`, session strategy, rate limiters (ATT-1269)                                                           | `session.strategy.spec.ts`, rate-limit specs                                                                                                                                       |

Existing durable-audit, balance, usage-recovery and device-effect tests stay where they are; the conformance suite adds
the engine-independent contract next to them.

## Plugin transactions

There is no process-wide queue for plugin transactions. The transactions (and the writes without scope) of **one**
plugin are ordered by a transaction-level advisory lock on the plugin's name, so the SDK contract holds: a
check-then-write sequence inside a plugin transaction cannot be raced, also across API instances. Core work and other
plugins never wait for that lock. A wait that reaches `lock_timeout` fails the transaction with
`PluginStorageConflict`; the host does not retry.

## Plugin storage

Plugins have no database access; they keep data in declared tables through the record port (see
[Plugin Storage](plugins/plugin-storage.md)). The host guarantees, on every backend:

- **Isolation by namespace.** A plugin's tables are `plugin_<plugin>_<table>` (or an adopted physical name inside that
  namespace). The port serves only the tables of the plugin's own declaration; no core table, no other plugin's table.
- **Atomic migrations.** Each neutral migration (DDL steps, data step and the history record) is one transaction, or it
  leaves nothing behind. Adoption of a 1.x installation records the baseline without running anything and refuses a
  partial legacy history without mutation (the SQLite upgrade moves no plugin data, so it applies only to legacy tables
  already in PostgreSQL).
- **Atomic `update`.** The `where` of `update` is evaluated with the write, so it is a compare-and-set that returns 0
  when another writer won. Plugin transactions follow the unit-of-work contract above: `afterCommit` callbacks never
  run on rollback, nesting is rejected and a conflict is reported as `PluginStorageConflict`.
- **Neutral errors and values.** Unique violations, conflicts, missing rows and invalid input are the same neutral
  errors on every engine; timestamps are UTC instants, decimals are exact strings.
- **Backup.** Plugin tables and each plugin's schema state (applied version) live in the PostgreSQL database, so a
  database backup contains them and restores them as one unit with the core data.

These are covered by the plugin-storage conformance suite that every backend adapter has to pass.

## Single instance versus several replicas

Attraccess is designed and tested as **one API process per database**. PostgreSQL removes the file lock of the old
SQLite setup, and the database-level guarantees above hold for several processes, but the application does not claim
horizontal scaling.

Process-local assumptions that a second replica would break:

- In-memory chains and locks such as the session change queue, reader session handling and plugin upload locks.
- Schedulers, for example the maintenance schedule evaluation (ATT-627), which would run in every replica.
- Live update fan-out for most topics, and the companion device websockets, which only reach clients connected to
  the same process (mass introductions and supervision are shared, see below).
- The MQTT client connections and plugin event bus.
- Rate-limit state when Valkey is not configured; with Valkey it is shared.

What PostgreSQL already provides for a shared database: the atomic balance and usage-integrity guarantees
(constraints, triggers, advisory locks), single-winner claims on unique keys and atomic session and token rotation.
Still missing for several replicas: a leader or lock for schedulers and shared live updates for the topics other than
mass introductions and supervision; the scaling follow-ups own them.

### Shared through Valkey (ATT-1163)

With `VALKEY_URL` set, these hold across API instances. Without it the same guarantees hold within the one process,
as before.

- **Instance liveness**: each instance renews a heartbeat every 5 s that lapses after 15 s. A surviving instance (exactly
  one, by an atomic claim) then drops the gone instance's readers, frees their screen claims and ends the supervision
  requests whose requester it held.
- **Reader presence**: which instances hold a websocket of each reader, newest connection first. "Reader is offline"
  means no instance holds it. Reader work runs on the holding instances: in process when it is this one, over the
  Valkey pub/sub bus (request/response with timeouts) otherwise.
- **Reader screen claim**: one flow at a time owns a reader (mass introduction, supervision started from the web, card
  enrollment, card reset), taken with an atomic claim and released compare-and-delete, with a TTL so a crashed holder
  cannot block a reader. A second flow gets the usual 409. A supervision started at the reader takes no claim; the
  socket state of the instance holding the reader guards it. With or without Valkey, card enrollment and card reset
  answer 409 while any supervision runs at the reader. When a reader reconnects to another instance before its
  old one is cleaned up, a flow armed through the old socket ends then.
- **Mass introductions**: sessions, participants and wrong-code counters live in Valkey with native TTLs. A user is
  introduced at most once per session (an atomic join claim; a concurrent join waits for the winner), five wrong codes
  per minute count across instances, and a session ends exactly once.
- **Supervision requests**: pending requests live in Valkey. Approve, reject, expiry, requester abort, reader cancel
  and card settle each take the request out of pending in one atomic step, so a request settles at most once and starts
  at most one session. One reader request per requester is an atomic reservation.
- **Deadlines** (mass-introduction and supervision expiry): a sorted set swept by every instance every 500 ms; removing
  an item is the claim, so each deadline fires exactly once, within about a second. No keyspace notifications.
- **Live updates** of the `mass-introduction` and `supervision` topics (and the supervision SSE endpoint) reach the
  user's streams on every instance. Other topics stay per process (follow-up).

Still per process: the requester's blocked supervision call and a plugin BLE link routed through another instance
(both fail cleanly when that instance dies, they are not migrated), the metrics gauges, rate limits without Valkey,
schedulers and the other live topics. Pub/sub is fire-and-forget: a message published while an instance reconnects is
lost, so outcomes that matter (supervision results, expiries) are also kept in Valkey and looked up after the deadline. A
revoked or re-paired reader credential does not rely on its message either: each instance caches credentials for at
most 10 s and checks the readers it holds against the database every 30 s. If Valkey fails in the moment between arming a reader on another
instance and recording it in the mass introduction, that reader can stay armed and busy until the session's 15 min
lifetime ends.

Also per instance, on purpose or as a known limit:

- **Pairing admission**: connection attempts per address and the cap on waiting readers guard the instance that holds
  the reader's socket. The approver's wrong-code count is shared.
- **Reader UI alerts**: after a crash-loop alert the instance holding the reader pauses that reader's plugin hooks.
  Clearing the alert on another instance ends the pause only there; the reader's own instance resumes when its
  30-minute window ends.
- **BLE writes without response**: their window and late failures are tracked by the link on the instance that holds
  the reader.

Valkey must be standalone or behind Sentinel: the coordination runs Lua scripts on several keys, which a sharded cluster
does not allow. Instances from before this change keep the shared state in their own process, so restart all instances
together when upgrading; a rolling upgrade across that version is not supported.
