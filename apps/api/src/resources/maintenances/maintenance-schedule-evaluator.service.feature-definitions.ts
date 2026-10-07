export /**
 * SQLite stores `datetime` columns as `YYYY-MM-DD HH:mm:ss.SSS` in UTC (TypeORM's
 * DateUtils.mixedDateToUtcDatetimeString). `new Date(...)` parses that as *local* time, and
 * `.toISOString()` produces a `T`/`Z` form that doesn't compare correctly against stored values.
 * These two helpers are the only places that bridge the formats.
 */
const parseDbDate = (value: string | Date): Date =>
  value instanceof Date ? value : new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);

export const formatDbDate = (date: Date): string => date.toISOString().replace('T', ' ').replace('Z', '');

/**
 * Per-(resource, schedule) evaluation data in one query. The `(resourceId, scheduleId, createdAt)`
 * triples are supplied as a CTE, so each schedule is evaluated against its own completed-maintenance
 * baseline without interpolating application values into SQL text.
 */
export const buildScheduleEvaluationQuery = (
  maintenanceTable: string,
  usageTable: string,
  pairCount: number,
): string => {
  const pairs = Array.from({ length: pairCount }, () => '(?, ?, ?)').join(', ');

  return `WITH pairs(resourceId, scheduleId, createdAt) AS (VALUES ${pairs}),
               baselines AS (
                 SELECT p.resourceId,
                        p.scheduleId,
                        COALESCE(MAX(done.endTime), p.createdAt) AS baseline,
                        EXISTS(
                          SELECT 1
                          FROM "${maintenanceTable}" active
                          WHERE active.resourceId = p.resourceId
                            AND active.startTime <= ?
                            AND active.endTime IS NULL
                        ) AS hasActiveMaintenance
                 FROM pairs p
                 LEFT JOIN "${maintenanceTable}" done
                   ON done.resourceId = p.resourceId
                  AND done.maintenanceScheduleId = p.scheduleId
                  AND done.endTime IS NOT NULL
                 GROUP BY p.resourceId, p.scheduleId, p.createdAt
               )
          SELECT b.resourceId AS resourceId,
                 b.scheduleId AS scheduleId,
                 b.baseline AS baseline,
                 b.hasActiveMaintenance AS hasActiveMaintenance,
                 COUNT(u.id) AS totalCount
          FROM baselines b
          LEFT JOIN "${usageTable}" u
            ON u.resourceId = b.resourceId
           AND u.lifecyclePending = 0
           AND u.endTime IS NOT NULL
           AND u.endTime >= b.baseline
          GROUP BY b.resourceId, b.scheduleId, b.baseline, b.hasActiveMaintenance`;
};
export const MAX_PAIRS_PER_QUERY = 10_921;
export const WRITE_TRANSACTION_BATCH_SIZE = 100;

/** Fetch completed-maintenance baselines and active state without scanning resource usage. */
export const buildScheduleStateQuery = (maintenanceTable: string, pairCount: number): string => {
  const pairs = Array.from({ length: pairCount }, () => '(?, ?, ?)').join(', ');

  return `WITH pairs(resourceId, scheduleId, createdAt) AS (VALUES ${pairs})
          SELECT p.resourceId AS resourceId,
                 p.scheduleId AS scheduleId,
                 COALESCE(MAX(done.endTime), p.createdAt) AS baseline,
                 EXISTS(
                   SELECT 1
                   FROM "${maintenanceTable}" active
                   WHERE active.resourceId = p.resourceId
                     AND active.startTime <= ?
                     AND active.endTime IS NULL
                 ) AS hasActiveMaintenance
          FROM pairs p
          LEFT JOIN "${maintenanceTable}" done
            ON done.resourceId = p.resourceId
           AND done.maintenanceScheduleId = p.scheduleId
           AND done.endTime IS NOT NULL
          GROUP BY p.resourceId, p.scheduleId, p.createdAt`;
};
