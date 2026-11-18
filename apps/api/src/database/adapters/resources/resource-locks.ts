import type { EntityManager } from 'typeorm';

/**
 * Transaction-scoped advisory lock namespaces (the first key of `pg_advisory_xact_lock(int, int)`; the second is the
 * resource id). They replace the global write serialisation SQLite gave for free: work that must not interleave per
 * resource takes the lock first and holds it until commit or rollback, while other resources and every plain read keep
 * running. Advisory locks never conflict with row locks or foreign key checks, so they cannot deadlock with ordinary
 * writes to the resource row.
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
