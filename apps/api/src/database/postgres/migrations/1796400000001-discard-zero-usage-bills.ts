import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sessions without any charge no longer leave a bill. This removes the completed 0 credit usage bills earlier
 * releases wrote for them: no item has a value, and no refund or correction refers to them (those references cascade
 * and would take the refund or correction with them). A bill whose usage still waits for a priced meter reading stays,
 * as the late meter correction refers to it. The balance triggers subtract the amount of a deleted bill, 0 here, so
 * no balance changes; the items go with their bill (ON DELETE CASCADE).
 */
export class DiscardZeroUsageBills1796400000001 implements MigrationInterface {
  name = 'DiscardZeroUsageBills1796400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "billing_transaction" "bill"
       WHERE "bill"."resourceUsageId" IS NOT NULL
         AND "bill"."status" = 'completed'
         AND "bill"."amount" = 0
         AND NOT EXISTS (
           SELECT 1 FROM "billing_transaction_item" "item"
           WHERE "item"."billingTransactionId" = "bill"."id" AND "item"."unitPrice" <> 0 AND "item"."quantity" <> 0)
         AND NOT EXISTS (SELECT 1 FROM "billing_transaction" "refund" WHERE "refund"."refundOfId" = "bill"."id")
         AND NOT EXISTS (
           SELECT 1 FROM "billing_transaction" "correction" WHERE "correction"."correctionOfId" = "bill"."id")
         AND NOT EXISTS (
           SELECT 1 FROM "resource_metering_session" "meter"
           WHERE "meter"."usageId" = "bill"."resourceUsageId" AND "meter"."status" = 'pending'
             AND "meter"."creditsPerUnit" > 0)`,
    );
  }

  public async down(): Promise<void> {
    // Deleted data cleanup: the removed 0 credit bills cannot be restored, and nothing depends on them.
  }
}
