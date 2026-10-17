import { EntityManager } from 'typeorm';

// A separate, durable recovery journal also works during migrations, before AuditService starts.
// Historical identifiers have no foreign keys: deletion must not cascade away recovery evidence.
export const USAGE_RECOVERY_TABLE_SQL = `CREATE TABLE IF NOT EXISTS resource_usage_recovery (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  usageId integer NOT NULL,
  resourceId integer NOT NULL,
  userId integer,
  startTime datetime NOT NULL,
  originalEndNotes text,
  originalAttributedOperatingDurationInMinutes float,
  recoveredAt datetime NOT NULL DEFAULT (datetime('now')),
  reason text NOT NULL
)`;

/** Caller owns the transaction. Only the impossible open, unfinalized, non-pending state is cancelled. */
export async function recoverOrphanedUsages(database: Pick<EntityManager, 'query'>): Promise<number> {
  const predicate = 'endTime IS NULL AND isFinalized = 0 AND lifecyclePending = 0';
  const [{ count }]: [{ count: number }] = await database.query(
    `SELECT COUNT(*) AS count FROM resource_usage WHERE ${predicate}`,
  );
  if (count === 0) return 0;
  await database.query(`INSERT INTO resource_usage_recovery
    (usageId, resourceId, userId, startTime, originalEndNotes, originalAttributedOperatingDurationInMinutes, reason)
    SELECT id, resourceId, userId, startTime, endNotes, attributedOperatingDurationInMinutes,
      'cancelled_orphan_unfinalized_session' FROM resource_usage WHERE ${predicate}`);
  await database.query(`UPDATE resource_usage SET
    endTime = startTime,
    attributedOperatingDurationInMinutes = 0,
    endNotes = CASE WHEN endNotes IS NULL OR endNotes = '' THEN '' ELSE endNotes || char(10) END ||
      '[Recovery: cancelled orphan unfinalized session; no confirmed end time, no duration or charge inferred.]'
    WHERE ${predicate}`);
  return count;
}
