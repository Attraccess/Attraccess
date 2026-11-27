import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indexes for the columns that refer to a billing transaction. All three are ON DELETE CASCADE foreign keys, so
 * deleting a transaction (the pending bill of a session without any charge, or the 0 credit bills removed by
 * DiscardZeroUsageBills1796400000001) scans each referencing table without them. Loading a bill's items uses
 * "billingTransactionId" too.
 */
export class BillingTransactionReferenceIndexes1796400000000 implements MigrationInterface {
  name = 'BillingTransactionReferenceIndexes1796400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_billing_transaction_item_transaction" ON "billing_transaction_item" ("billingTransactionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_billing_transaction_refund_of" ON "billing_transaction" ("refundOfId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_billing_transaction_correction_of" ON "billing_transaction" ("correctionOfId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_billing_transaction_correction_of"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_billing_transaction_refund_of"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_billing_transaction_item_transaction"`);
  }
}
