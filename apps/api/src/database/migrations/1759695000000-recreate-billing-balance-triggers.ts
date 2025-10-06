import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecreateBillingBalanceTriggers1759695000000 implements MigrationInterface {
  name = 'RecreateBillingBalanceTriggers1759695000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure any previous versions of these triggers are dropped before recreating
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_insert"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_update"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_delete"`);

    // Only completed transactions should affect the user's creditBalance
    await queryRunner.query(
      `CREATE TRIGGER "trg_billing_transaction_balance_after_insert"
       AFTER INSERT ON "billing_transaction"
       BEGIN
         UPDATE "user"
         SET creditBalance = creditBalance + NEW.amount,
             updatedAt = datetime('now')
         WHERE id = NEW.userId AND NEW.status = 'completed';
       END`,
    );

    await queryRunner.query(
      `CREATE TRIGGER "trg_billing_transaction_balance_after_update"
       AFTER UPDATE ON "billing_transaction"
       BEGIN
         -- Remove the effect of the OLD row if it was contributing (completed)
         UPDATE "user"
         SET creditBalance = creditBalance - OLD.amount,
             updatedAt = datetime('now')
         WHERE id = OLD.userId
           AND OLD.status = 'completed'
           AND (
             OLD.userId != NEW.userId OR
             OLD.amount != NEW.amount OR
             OLD.status != NEW.status
           );

         -- Apply the effect of the NEW row if it contributes (completed)
         UPDATE "user"
         SET creditBalance = creditBalance + NEW.amount,
             updatedAt = datetime('now')
         WHERE id = NEW.userId
           AND NEW.status = 'completed'
           AND (
             OLD.userId != NEW.userId OR
             OLD.amount != NEW.amount OR
             OLD.status != NEW.status
           );
       END`,
    );

    await queryRunner.query(
      `CREATE TRIGGER "trg_billing_transaction_balance_after_delete"
       AFTER DELETE ON "billing_transaction"
       BEGIN
         UPDATE "user"
         SET creditBalance = creditBalance - OLD.amount,
             updatedAt = datetime('now')
         WHERE id = OLD.userId AND OLD.status = 'completed';
       END`,
    );

    // Recalculate all users' balances based solely on completed transactions
    await queryRunner.query(
      `UPDATE "user"
       SET creditBalance = COALESCE((
             SELECT SUM(bt.amount)
             FROM "billing_transaction" bt
             WHERE bt.userId = "user".id AND bt.status = 'completed'
           ), 0),
           updatedAt = datetime('now')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_insert"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_update"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_delete"`);
  }
}
