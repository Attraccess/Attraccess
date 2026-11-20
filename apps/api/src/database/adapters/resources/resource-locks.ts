import type { EntityManager } from 'typeorm';

/**
 * Transaction-scoped advisory lock namespaces (the first key of `pg_advisory_xact_lock(int, int)`; the second is the
 * resource id). They replace the global write serialisation SQLite gave for free: work that must not interleave per
 * resource takes the lock first and holds it until commit or rollback, while other resources and every plain read keep
 * running. Advisory locks never conflict with row locks or foreign key checks, so they cannot deadlock with ordinary
 * writes to the resource row.
 *
 * Every advisory lock key in use, so a new one stays unique (one-key and two-key locks are separate spaces in
 * PostgreSQL, but keep the numbers distinct anyway; take the next free number of the module's hundred):
 * - 584_001, 584_002: test database template and clone setup (`test-utils/test-database.ts`, session-level, one key)
 * - 584_101: administrator guard (`adapters/users/typeorm-rbac.store.ts`, one key)
 * - 584_102: account creation and first-time-setup claim (`adapters/users/typeorm-user.store.ts`, one key)
 * - 584_201, 584_202, 584_203: `RESOURCE_LOCK` below (two keys, the resource id second)
 * - 584_301, 584_302, 584_303: resource canvas, flow canvas, flow variables (`adapters/flows/*`, two keys)
 * - 584_401: local password per user (`adapters/auth/typeorm-credential.store.ts`, two keys)
 * - 584_402: Attractap pairing key (`adapters/attractap/typeorm-credential.store.ts`, two keys)
 * - 584_501: plugin transactions and writes without scope, per plugin (`postgres/plugin-storage/postgres-storage-sessions.ts`,
 *   two keys, `hashtext(<plugin name>)` second)
 * - 584_601: MCP OAuth client registration (`adapters/mcp/typeorm-mcp-oauth.store.ts`, one key)
 * - 584_584: SQLite transfer (`postgres/postgres-advisory-lock.ts`, session-level, one key)
 * - 584_585: core migrations at startup and before a transfer (`postgres/postgres-advisory-lock.ts`, session-level,
 *   one key; taken after 584_584 when both are held)
 * - hashed keys: `hashtext('resource_usage_single_active')` + resource id in the usage integrity trigger
 *   (`postgres/migrations/baseline/triggers.ts`); `hashtextextended('attraccess:plugin-storage:<versions table>', 0)`
 *   in the plugin storage migrations (`postgres/plugin-storage/postgres-storage-migration-driver.ts`)
 */
export const RESOURCE_LOCK = {
  /** Session lifecycle: capacity checks, one session per user, takeover reservations. */
  usageLifecycle: 584_201,
  /** Operating timeline: the one open interval and its monotonic transitions. */
  operatingTimeline: 584_202,
  /** Maintenance creation: the check for an active maintenance and the insert of a new one (schedule or manual). */
  maintenance: 584_203,
} as const;

/** Waits for the lock of `kind` on a resource; it is released with the surrounding transaction. */
export async function lockResource(
  manager: Pick<EntityManager, 'query'>,
  kind: (typeof RESOURCE_LOCK)[keyof typeof RESOURCE_LOCK],
  resourceId: number,
): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [kind, resourceId]);
}
