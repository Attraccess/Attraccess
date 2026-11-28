import { BillingTransactionStatus, type SwitchedSessionCharge } from '@attraccess/application-models';
import type { EntityManager } from 'typeorm';
import { continuedCondition } from '../usage/session-part-conditions';

interface Row {
  isContinuation: boolean;
  continues: boolean;
  sessionAmount: string;
  resourceName: string;
}

/**
 * Walks from the usage back through all earlier parts of its session. Meter corrections carry no usage of their own:
 * they count through the bill they correct.
 */
export async function findSwitchedSessionCharge(
  manager: EntityManager,
  usageId: number,
  userId: number,
): Promise<SwitchedSessionCharge | null> {
  const [row]: Row[] = await manager.query(
    `WITH RECURSIVE "chain" AS (
       SELECT "id", "previousUsageId" FROM "resource_usage" WHERE "id" = $1
       UNION ALL
       SELECT "part"."id", "part"."previousUsageId"
       FROM "resource_usage" "part"
       JOIN "chain" ON "part"."id" = "chain"."previousUsageId"
     ), "bill" AS (
       SELECT "id", "userId", "amount", "status" FROM "billing_transaction"
       WHERE "resourceUsageId" IN (SELECT "id" FROM "chain")
     ), "charge" AS (
       SELECT "userId", "amount", "status" FROM "bill"
       UNION ALL
       SELECT "correction"."userId", "correction"."amount", "correction"."status"
       FROM "bill"
       JOIN "billing_transaction" "correction" ON "correction"."correctionOfId" = "bill"."id"
     )
     SELECT "usage"."previousUsageId" IS NOT NULL AS "isContinuation",
       ${continuedCondition('usage')} AS "continues",
       (SELECT COALESCE(SUM("amount"), 0) FROM "charge" WHERE "userId" = $2 AND "status" = $3) AS "sessionAmount",
       "resource"."name" AS "resourceName"
     FROM "resource_usage" "usage"
     JOIN "resource" ON "resource"."id" = "usage"."resourceId"
     WHERE "usage"."id" = $1`,
    [usageId, userId, BillingTransactionStatus.Completed],
  );
  if (!row || (!row.isContinuation && !row.continues)) return null;
  return { continues: row.continues, sessionAmount: Number(row.sessionAmount), resourceName: row.resourceName };
}
