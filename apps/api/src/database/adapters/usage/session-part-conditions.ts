/** Where the continuation is looked up, and which continuations count. */
export interface ContinuationConditionOptions {
  /** The usage table, quoted here; `resource_usage` unless the caller reads it from the entity metadata. */
  table?: string;
  /** SQL the continuation must have started before (e.g. `:asOf`); a later one does not continue it yet. */
  startedBefore?: string;
}

/**
 * True when a published part continues the usage `alias` (a pending switch's continuation does not yet). The usage
 * that has one is no longer the last part of its session.
 */
export function continuedCondition(alias: string, options: ContinuationConditionOptions = {}): string {
  const table = options.table ?? 'resource_usage';
  const startedBefore = options.startedBefore ? ` AND "next"."startTime" < ${options.startedBefore}` : '';
  return (
    `EXISTS (SELECT 1 FROM "${table}" "next" WHERE "next"."previousUsageId" = "${alias}"."id"` +
    ` AND "next"."lifecyclePending" = false${startedBefore})`
  );
}

/**
 * True when the usage `alias` is the last part of its session. A session whose project was switched is several
 * records but one session, so every count of sessions (uses, supervised sessions, sessions in a range) must keep only
 * the rows this condition admits.
 */
export function lastPartCondition(alias: string, options: ContinuationConditionOptions = {}): string {
  return `NOT ${continuedCondition(alias, options)}`;
}
