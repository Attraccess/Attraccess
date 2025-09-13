import { MigrationInterface, QueryRunner } from 'typeorm';

export class BillingTransactionsSumupTransactionTracking1757797050610 implements MigrationInterface {
  name = 'BillingTransactionsSumupTransactionTracking1757797050610';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop existing balance triggers (they will be recreated with status handling)
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_insert"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_update"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_delete"`);

    await queryRunner.query(
      `CREATE TABLE "temporary_billing_transaction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "amount" integer NOT NULL, "initiatorId" integer, "resourceUsageId" integer, "refundOfId" integer, "externalReference" text, "status" varchar CHECK( "status" IN ('pending','completed','failed') ) NOT NULL, CONSTRAINT "FK_a0a4f865c54aad3f2724298410c" FOREIGN KEY ("refundOfId") REFERENCES "billing_transaction" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_08e16fa731a38197b56fed4d04b" FOREIGN KEY ("resourceUsageId") REFERENCES "resource_usage" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_bc081ca206dc8583c3c88c7dd16" FOREIGN KEY ("initiatorId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_4ba793103570a8ad8b214a61418" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_billing_transaction"("id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "status") SELECT "id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", 'completed' FROM "billing_transaction"`,
    );
    await queryRunner.query(`DROP TABLE "billing_transaction"`);
    await queryRunner.query(`ALTER TABLE "temporary_billing_transaction" RENAME TO "billing_transaction"`);

    // Recreate balance triggers so only completed transactions affect the user's creditBalance
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the status-aware triggers before reverting the table
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_insert"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_update"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_delete"`);

    await queryRunner.query(`ALTER TABLE "billing_transaction" RENAME TO "temporary_billing_transaction"`);
    await queryRunner.query(
      `CREATE TABLE "billing_transaction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "amount" integer NOT NULL, "initiatorId" integer, "resourceUsageId" integer, "refundOfId" integer, CONSTRAINT "FK_a0a4f865c54aad3f2724298410c" FOREIGN KEY ("refundOfId") REFERENCES "billing_transaction" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_08e16fa731a38197b56fed4d04b" FOREIGN KEY ("resourceUsageId") REFERENCES "resource_usage" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_bc081ca206dc8583c3c88c7dd16" FOREIGN KEY ("initiatorId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_4ba793103570a8ad8b214a61418" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "billing_transaction"("id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId") SELECT "id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId" FROM "temporary_billing_transaction"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_billing_transaction"`);

    // Restore original triggers that ignore status (pre-sumup migration behavior)
    await queryRunner.query(
      `CREATE TRIGGER "trg_billing_transaction_balance_after_insert"
       AFTER INSERT ON "billing_transaction"
       BEGIN
         UPDATE "user"
         SET creditBalance = creditBalance + NEW.amount,
             updatedAt = datetime('now')
         WHERE id = NEW.userId;
       END`,
    );

    await queryRunner.query(
      `CREATE TRIGGER "trg_billing_transaction_balance_after_update"
       AFTER UPDATE ON "billing_transaction"
       BEGIN
         UPDATE "user"
         SET creditBalance = creditBalance - OLD.amount,
             updatedAt = datetime('now')
         WHERE id = OLD.userId AND (OLD.userId != NEW.userId OR OLD.amount != NEW.amount);

         UPDATE "user"
         SET creditBalance = creditBalance + NEW.amount,
             updatedAt = datetime('now')
         WHERE id = NEW.userId AND (OLD.userId != NEW.userId OR OLD.amount != NEW.amount);
       END`,
    );

    await queryRunner.query(
      `CREATE TRIGGER "trg_billing_transaction_balance_after_delete"
       AFTER DELETE ON "billing_transaction"
       BEGIN
         UPDATE "user"
         SET creditBalance = creditBalance - OLD.amount,
             updatedAt = datetime('now')
         WHERE id = OLD.userId;
       END`,
    );
  }
}
