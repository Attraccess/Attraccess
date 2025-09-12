import { MigrationInterface, QueryRunner } from 'typeorm';

export class BillingTransactions1757479833653 implements MigrationInterface {
  name = 'BillingTransactions1757479833653';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "billing_transaction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "amount" integer NOT NULL, "initiatorId" integer, "resourceUsageId" integer, "refundOfId" integer)`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "username" text NOT NULL, "email" text NOT NULL, "isEmailVerified" boolean NOT NULL DEFAULT (0), "emailVerificationToken" text, "emailVerificationTokenExpiresAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "canManageResources" boolean NOT NULL DEFAULT (0), "canManageSystemConfiguration" boolean NOT NULL DEFAULT (0), "canManageUsers" boolean NOT NULL DEFAULT (0), "canManageBilling" boolean NOT NULL DEFAULT (0), "passwordResetToken" text, "passwordResetTokenExpiresAt" datetime, "externalIdentifier" text, "nfcKeySeedToken" text, "lastUsernameChangeAt" datetime, "creditBalance" integer NOT NULL DEFAULT (0), CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "UQ_78a916df40e02a9deb1c4b75edb" UNIQUE ("username"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_user"("id", "username", "email", "isEmailVerified", "emailVerificationToken", "emailVerificationTokenExpiresAt", "createdAt", "updatedAt", "canManageResources", "canManageSystemConfiguration", "canManageUsers", "canManageBilling", "passwordResetToken", "passwordResetTokenExpiresAt", "externalIdentifier", "nfcKeySeedToken", "lastUsernameChangeAt") SELECT "id", "username", "email", "isEmailVerified", "emailVerificationToken", "emailVerificationTokenExpiresAt", "createdAt", "updatedAt", "canManageResources", "canManageSystemConfiguration", "canManageUsers", false, "passwordResetToken", "passwordResetTokenExpiresAt", "externalIdentifier", "nfcKeySeedToken", "lastUsernameChangeAt" FROM "user"`,
    );

    await queryRunner.query(
      `UPDATE "temporary_user" SET "canManageBilling" = true WHERE "id" = (SELECT MIN("id") FROM "temporary_user")`,
    );
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`ALTER TABLE "temporary_user" RENAME TO "user"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_billing_transaction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "amount" integer NOT NULL, "initiatorId" integer, "resourceUsageId" integer, "refundOfId" integer, CONSTRAINT "FK_4ba793103570a8ad8b214a61418" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_bc081ca206dc8583c3c88c7dd16" FOREIGN KEY ("initiatorId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_08e16fa731a38197b56fed4d04b" FOREIGN KEY ("resourceUsageId") REFERENCES "resource_usage" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_a0a4f865c54aad3f2724298410c" FOREIGN KEY ("refundOfId") REFERENCES "billing_transaction" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_billing_transaction"("id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId") SELECT "id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId" FROM "billing_transaction"`,
    );
    await queryRunner.query(`DROP TABLE "billing_transaction"`);
    await queryRunner.query(`ALTER TABLE "temporary_billing_transaction" RENAME TO "billing_transaction"`);

    // Create triggers to keep user.creditBalance in sync with billing_transaction changes
    // After INSERT: add NEW.amount to the user's balance
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

    // After UPDATE: handle amount and/or user change by reversing OLD and applying NEW
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

    // After DELETE: subtract OLD.amount from the user's balance
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop triggers first to allow table changes
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_insert"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_update"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_delete"`);
    await queryRunner.query(`ALTER TABLE "billing_transaction" RENAME TO "temporary_billing_transaction"`);
    await queryRunner.query(
      `CREATE TABLE "billing_transaction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "amount" integer NOT NULL, "initiatorId" integer, "resourceUsageId" integer, "refundOfId" integer)`,
    );
    await queryRunner.query(
      `INSERT INTO "billing_transaction"("id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId") SELECT "id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId" FROM "temporary_billing_transaction"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_billing_transaction"`);
    // Remove the creditBalance column added in the up migration without renaming/dropping the user table
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "creditBalance"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "canManageBilling"`);
    await queryRunner.query(`DROP TABLE "billing_transaction"`);
  }
}
