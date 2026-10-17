/** Validate direct seed/import writes before committing; never repair them implicitly. */
export async function assertUsageIntegrity(db) {
  const all = (sql) =>
    new Promise((resolve, reject) => db.all(sql, (error, rows) => (error ? reject(error) : resolve(rows))));
  const tables = await all("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'resource_usage'");
  if (tables.length === 0) return;
  const invalid = await all(`SELECT id FROM resource_usage
    WHERE endTime IS NULL AND isFinalized = 0 AND lifecyclePending = 0`);
  const duplicate = await all(`SELECT resourceId FROM resource_usage
    WHERE usageAction = 'usage' AND endTime IS NULL AND isFinalized = 1 AND lifecyclePending = 0
    GROUP BY resourceId HAVING COUNT(*) > 1`);
  const duplicatePending = await all(`SELECT resourceId FROM resource_usage
    WHERE endTime IS NULL AND lifecyclePending = 1
    GROUP BY resourceId HAVING COUNT(*) > 1`);
  const unreserved = await all(`SELECT u.id FROM resource_usage u WHERE u.lifecyclePending = 1 AND NOT EXISTS (
    SELECT 1 FROM resource_usage_lifecycle_attempt a WHERE a.resourceId = u.resourceId AND (
      (a.kind IN ('start', 'takeover') AND a.candidateUsageId = u.id)
      OR (a.kind = 'end' AND a.previousUsageId = u.id)))`);
  if (invalid.length || duplicate.length || duplicatePending.length || unreserved.length) {
    throw new Error(
      `Invalid usage lifecycle state after seed/import: orphans=${invalid.length}, duplicate active resources=${duplicate.length}, duplicate pending resources=${duplicatePending.length}, unreserved candidates=${unreserved.length}`,
    );
  }
}
