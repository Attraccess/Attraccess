/**
 * PostgreSQL returns `timestamptz` columns as `Date` and accepts `Date` parameters, so no format bridging is needed.
 * Identifiers are quoted: PostgreSQL folds unquoted camelCase names to lower case. Parameters are `$n`: the
 * `(resourceId, scheduleId, createdAt)` triples first, then (for the queries that check it) the evaluation time.
 */

/** `($1::int, $2::int, $3::timestamptz), ($4::int, ...)`: typed so the CTE column types do not depend on inference. */
const pairValues = (pairCount: number): string =>
  Array.from({ length: pairCount }, (_, index) => {
    const base = index * 3;
    return `($${base + 1}::int, $${base + 2}::int, $${base + 3}::timestamptz)`;
  }).join(', ');

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
  const pairs = pairValues(pairCount);
  const now = `$${pairCount * 3 + 1}::timestamptz`;

  return `WITH pairs("resourceId", "scheduleId", "createdAt") AS (VALUES ${pairs}),
               baselines AS (
                 SELECT p."resourceId",
                        p."scheduleId",
                        COALESCE(MAX(done."endTime"), p."createdAt") AS baseline,
                        EXISTS(
                          SELECT 1
                          FROM "${maintenanceTable}" active
                          WHERE active."resourceId" = p."resourceId"
                            AND active."startTime" <= ${now}
                            AND active."endTime" IS NULL
                        ) AS "hasActiveMaintenance"
                 FROM pairs p
                 LEFT JOIN "${maintenanceTable}" done
                   ON done."resourceId" = p."resourceId"
                  AND done."maintenanceScheduleId" = p."scheduleId"
                  AND done."endTime" IS NOT NULL
                 GROUP BY p."resourceId", p."scheduleId", p."createdAt"
               )
          SELECT b."resourceId" AS "resourceId",
                 b."scheduleId" AS "scheduleId",
                 b.baseline AS baseline,
                 b."hasActiveMaintenance" AS "hasActiveMaintenance",
                 COUNT(u.id) AS "totalCount"
          FROM baselines b
          LEFT JOIN "${usageTable}" u
            ON u."resourceId" = b."resourceId"
           AND u."lifecyclePending" = false
           AND u."endTime" IS NOT NULL
           AND u."endTime" >= b.baseline
           -- A session whose project was switched is one use, counted when its last part ends.
           AND NOT EXISTS (
             SELECT 1 FROM "${usageTable}" next
             WHERE next."previousUsageId" = u.id AND next."lifecyclePending" = false
           )
          GROUP BY b."resourceId", b."scheduleId", b.baseline, b."hasActiveMaintenance"`;
};

/** PostgreSQL allows 65535 bind parameters per statement: three per pair plus the evaluation time. */
export const MAX_PAIRS_PER_QUERY = 21_000;

export const WRITE_TRANSACTION_BATCH_SIZE = 100;

/** Fetch completed-maintenance baselines and active state without scanning resource usage. */
export const buildScheduleStateQuery = (maintenanceTable: string, pairCount: number): string => {
  const pairs = pairValues(pairCount);
  const now = `$${pairCount * 3 + 1}::timestamptz`;

  return `WITH pairs("resourceId", "scheduleId", "createdAt") AS (VALUES ${pairs})
          SELECT p."resourceId" AS "resourceId",
                 p."scheduleId" AS "scheduleId",
                 COALESCE(MAX(done."endTime"), p."createdAt") AS baseline,
                 EXISTS(
                   SELECT 1
                   FROM "${maintenanceTable}" active
                   WHERE active."resourceId" = p."resourceId"
                     AND active."startTime" <= ${now}
                     AND active."endTime" IS NULL
                 ) AS "hasActiveMaintenance"
          FROM pairs p
          LEFT JOIN "${maintenanceTable}" done
            ON done."resourceId" = p."resourceId"
           AND done."maintenanceScheduleId" = p."scheduleId"
           AND done."endTime" IS NOT NULL
          GROUP BY p."resourceId", p."scheduleId", p."createdAt"`;
};
