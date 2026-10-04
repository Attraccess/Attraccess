# Usage lifecycle integrity

A usable machine session has `usageAction = 'usage'`, no `endTime`,
`isFinalized = 1`, and `lifecyclePending = 0`. Single and bulk reads, controls,
start/takeover, end, and activity flows use this definition. A pending candidate
is not published; a lifecycle attempt reserves the resource through start,
takeover, or end. Start/end also reject open pending rows without an attempt.

## Recovery after upgrade or restart

The integrity migration and startup recovery cancel every open, unfinalized,
non-pending row. This state is never a supported two-phase transition. There is
no age threshold or demo-marker requirement. Finalized active sessions and valid
pending reservations are excluded from this policy.

Cancellation preserves the usage ID, user/resource/project references, notes,
form submissions, and billing records. It sets `endTime = startTime`, attributed
operating duration to zero, and appends an explicit recovery note. **The row stays
unfinalized**: it is a cancelled candidate, not a confirmed session. The synthetic
end time represents no confirmed duration. Recovery never charges, refunds,
changes user balances, emits usage events, or runs physical flows.

The same transaction inserts a row in `resource_usage_recovery` with the original
usage/resource/user IDs, start time, end notes, operating attribution, recovery
time, and reason `cancelled_orphan_unfinalized_session`. The reason denotes the
original flags (`isFinalized = 0`, `lifecyclePending = 0`, `endTime IS NULL`). If
journaling fails, cancellation rolls back. Subsequent recovery finds no candidate
and adds no journal entry. This journal has no cascading foreign keys and is
retained on migration downgrade, together with cancelled history.

```sql
SELECT * FROM resource_usage_recovery ORDER BY id;
```

Recorded interrupted lifecycle attempts retain their existing startup abort
policy: discard unpublished pending candidates/drafts, keep the outgoing real
session, and never replay external effects. Startup recovery must not be invoked
to interrupt live operations.

## Write and seed validation

SQLite insert/update triggers reject `endTime IS NULL AND isFinalized = 0 AND
lifecyclePending = 0`, including direct inserts that rely on defaults. Triggers
also prevent a second published active session from being inserted or activated
for the same resource. Existing duplicate finalized sessions are retained for an
operator to end explicitly; reads consistently select the newest start time,
then the highest ID. Recovery never guesses which real session to cancel.
A partial unique index allows one open pending candidate per resource, alongside
the outgoing active session during takeover; the lifecycle-attempt unique index
reserves all operation kinds, including ends without a candidate.

These guards avoid rebuilding SQLite's usage table, preserving its generated
duration column, dependent views, and foreign keys. Keep the guards when writing
imports. Create confirmed historical/demo sessions with explicit valid flags,
or use the service lifecycle for actual usage; do not insert unfinished candidates
outside that lifecycle.

Both development seed tools check for invalid open rows, duplicate active
sessions, and pending candidates without matching attempts before committing.
An integrity failure rolls back the seed instead of silently repairing it.
`scripts/usage-integrity.mjs` exports the same check for SQLite import tooling.
