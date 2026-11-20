import { postgresProvider } from './lib/database-provider.mjs';

/** Validate direct seed/import writes before committing; never repair them implicitly. */
export async function assertUsageIntegrity(db, provider = postgresProvider) {
  const all = (sql) => provider.all(db, sql);
  if (!(await provider.hasTable(db, 'resource_usage'))) return;
  const invalid = await all(`SELECT id FROM resource_usage
    WHERE "endTime" IS NULL AND NOT "isFinalized" AND NOT "lifecyclePending"`);
  const duplicate = await all(`SELECT "resourceId" FROM resource_usage
    WHERE "usageAction" = 'usage' AND "endTime" IS NULL AND "isFinalized" AND NOT "lifecyclePending"
    GROUP BY "resourceId" HAVING COUNT(*) > 1`);
  const duplicatePending = await all(`SELECT "resourceId" FROM resource_usage
    WHERE "endTime" IS NULL AND "lifecyclePending"
    GROUP BY "resourceId" HAVING COUNT(*) > 1`);
  const unreserved = await all(`SELECT u.id FROM resource_usage u WHERE u."lifecyclePending" AND NOT EXISTS (
    SELECT 1 FROM resource_usage_lifecycle_attempt a WHERE a."resourceId" = u."resourceId" AND (
      (a.kind IN ('start', 'takeover') AND a."candidateUsageId" = u.id)
      OR (a.kind = 'end' AND a."previousUsageId" = u.id)))`);
  if (invalid.length || duplicate.length || duplicatePending.length || unreserved.length) {
    throw new Error(
      `Invalid usage lifecycle state after seed/import: orphans=${invalid.length}, duplicate active resources=${duplicate.length}, duplicate pending resources=${duplicatePending.length}, unreserved candidates=${unreserved.length}`,
    );
  }
}
