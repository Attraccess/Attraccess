# Adding a database backend

SQLite is the only implemented relational backend. `DATABASE_TYPE` defaults to `sqlite`; other values stop startup before connections, plugin schema loading or migrations. Adding a selector value alone does not add backend support. PostgreSQL implementation and running several API instances belong to ATT-584.

## Ownership

Application services use records from `@attraccess/application-models` and feature operation ports. Controllers and live events use explicit response projections. `libs/database-entities` contains SQLite schema classes for implementations and released migration compatibility; it is not an application model package.

`apps/api/src/database/backend.config.ts` validates configuration. `backend.registry.ts` selects implementations. `sqlite/` owns SQLite connection options, schema registration, transactions, error classification, development seeding and integrity tooling. Feature `persistence/port.ts` files define application operations; their `typeorm-adapter.ts` implementations own queries, joins, conditional writes and record conversion. Nest composition modules bind them.

## Implementing another engine

1. Add typed configuration and an implementation to the backend registry. Validate unavailable or invalid configurations before opening any connection. Keep credentials out of errors and logs.
2. Supply a separate schema and migration track. Do not rewrite released SQLite migrations, reuse their SQL on another engine, or enable automatic schema synchronization. Preserve stable IDs and relationships, exact amounts and counter strings, UTC instants, nulls, binary values and durable migration identities.
3. Implement each feature port. Keep business decisions, authorization, billing calculations, device protocols and external effects in the application. Translate engine errors inside implementations. Return plain records, never repositories, lazy entities, query builders or engine exceptions.
4. Implement `TransactionDriver` and bind transaction operations to the caller's connection. A nested operation reuses its parent `TransactionScope`, cannot expand its declared resource/account conflict set, and cannot commit independently. Make conditional updates, uniqueness, ordering and isolation work across real independent connections. Do not use an application-wide mutex as a substitute.
5. Provide backend-specific plugin migrations and operation adapters. Require explicit plugin backend support before schema registration, migration-history reads, migration or activation. A plugin with no persistence declaration remains legacy SQLite-only. Never label an untested plugin portable.
6. Run the shared conformance suites with a real engine fixture and independent connections. Keep the suite assertions unchanged when substituting a fixture. Add engine-specific migration and driver checks alongside them.

## Required evidence

`pnpm nx run api:test-persistence` runs SQLite conformance. Backend fixtures construct real application services; simulated mail transports only make delivery failure and attempt counts deterministic. A future engine must prove the same application behavior, not replace the fixture with mocked database results.

Validate fresh install and development seeding; migration interruption, restart and supported rollback; generated durations; constraints and indexes; exact balances and metering evidence; atomic usage, takeover and accounting failures; authentication and session rotation; immutable audit and commit receipts; and packaged plugin install, upgrade and uninstall. Compare REST, OpenAPI and live-event projections so private fields never depend on entity decorators for filtering.

The two constructed SQLite upgrade fixtures stop before usage-integrity enforcement and at the released pre-refactor schema. They preserve seeded identity, access, session, billing, meter, audit, operating and plugin values. They are not tests against an operator's production backup, and do not establish PostgreSQL support.

## Deployment and transfer limits

Selecting a backend does not copy data. A future transfer must preserve IDs, foreign keys, completed ledger amounts and balances, precise counter strings, timestamps, private credential envelopes, sessions, audit/operation receipts, plugin tables and both core and plugin migration histories. Validate counts and exact values before cutover, retain a restorable backup, and define recovery before accepting writes on the new engine. There is no cross-engine transfer command in this release.

Database-neutral ports do not establish multi-instance safety. Process-local queues, timers, event dispatch, flow execution, MQTT/device subscriptions and WAGO operation ownership still need deployment-wide coordination in ATT-584. Valkey-backed sessions alone do not coordinate these activities. Keep a single active API writer/coordinator until that work is implemented and verified.

### Cross-engine transfer contract (implementation in ATT-584)

- Export one consistent snapshot with all writers stopped, including background/device jobs and plugin writers. Include core and plugin tables in the same snapshot. Record application/plugin versions, source schema and migration histories, table counts and a digest of exact values. Keep secrets in the protected export, never in its diagnostic report.
- Import into an empty isolated target using its own migration track. Load referenced rows before dependent rows: identities and access definitions, resources/projects and configuration, usages and operating records, then ledger/items, audit/operation receipts and plugin data in each plugin's declared dependency order. For cycles, use explicitly deferred constraints or a second relationship pass within the import transaction; never leave constraints disabled on completion.
- Preserve primary keys and foreign keys explicitly. After loading, reset each generated-key allocator/sequence beyond the largest imported key, including plugin tables. Preserve generated timestamps; recompute database-derived columns from their source values and compare with the export rather than writing engine-specific generated columns.
- Represent SQL null as JSON null, distinct from a missing field, empty string or zero. Encode booleans as JSON true/false; decode legacy SQLite 0/1 only for schema-declared boolean fields. Decode JSON columns once as structured JSON, preserving nested nulls, arrays and scalar types; a JSON string stays a string. Distinguish a SQL-null JSON column from the JSON value null in transfer metadata. Never infer types from text contents. Use decimal strings for exact integer counters and amounts that may exceed safe JSON numeric precision, UTC ISO-8601 instants for dates and an explicitly tagged base64 representation for bytes. Do not decrypt/re-encrypt credential envelopes during copying.
- Before enabling writes, validate foreign keys, uniqueness, nullability, row counts and exact per-record values/digests, balances against completed ledger history, counters, audit/operation receipts, and plugin migration names. Map source migration history to the target's own schema track; do not run SQLite SQL on another engine. Prove a new generated ID cannot collide, then run authentication, billing, device and plugin smoke checks in isolation. Keep the original stopped snapshot restorable. Once the target accepts writes, rollback requires a documented reverse transfer or recovery procedure; switching configuration alone loses new writes.
