import { MigrationInterface, QueryRunner } from 'typeorm';

const BILLING_TRIGGERS: Array<{ name: string; sql: string }> = [
  {
    name: 'trg_billing_transaction_balance_after_insert',
    sql: `CREATE TRIGGER "trg_billing_transaction_balance_after_insert"
       AFTER INSERT ON "billing_transaction"
       BEGIN
         UPDATE "user"
         SET creditBalance = creditBalance + NEW.amount,
             updatedAt = datetime('now')
         WHERE id = NEW.userId AND NEW.status = 'completed';
       END`,
  },
  {
    name: 'trg_billing_transaction_balance_after_update',
    sql: `CREATE TRIGGER "trg_billing_transaction_balance_after_update"
       AFTER UPDATE ON "billing_transaction"
       BEGIN
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
  },
  {
    name: 'trg_billing_transaction_balance_after_delete',
    sql: `CREATE TRIGGER "trg_billing_transaction_balance_after_delete"
       AFTER DELETE ON "billing_transaction"
       BEGIN
         UPDATE "user"
         SET creditBalance = creditBalance - OLD.amount,
             updatedAt = datetime('now')
         WHERE id = OLD.userId AND OLD.status = 'completed';
       END`,
  },
];

export class GuestAccountsUser1783300000000 implements MigrationInterface {
  name = 'GuestAccountsUser1783300000000';

  private async dropBillingTriggers(queryRunner: QueryRunner): Promise<void> {
    for (const trigger of BILLING_TRIGGERS) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS "${trigger.name}"`);
    }
  }

  private async createBillingTriggers(queryRunner: QueryRunner): Promise<void> {
    for (const trigger of BILLING_TRIGGERS) {
      await queryRunner.query(trigger.sql);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The billing balance triggers UPDATE the "user" table, so they must not exist
    // while the table is being rebuilt (DROP + RENAME) below.
    await this.dropBillingTriggers(queryRunner);

    await queryRunner.query(
      `CREATE TABLE "temporary_user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "username" text NOT NULL, "email" text, "isEmailVerified" boolean NOT NULL DEFAULT (0), "emailVerificationToken" text, "emailVerificationTokenExpiresAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "passwordResetToken" text, "passwordResetTokenExpiresAt" datetime, "externalIdentifier" text, "nfcKeySeedToken" text, "lastUsernameChangeAt" datetime, "creditBalance" integer NOT NULL DEFAULT (0), "billingFactor" integer NOT NULL DEFAULT (100), "deletedAt" datetime, "deleteAccountToken" text, "deleteAccountTokenExpiresAt" datetime, "deleteAccountRequestedAt" datetime, "lockedUntil" datetime, "failedLoginAttempts" integer NOT NULL DEFAULT 0, "firstFailedLoginAt" datetime, "locale" varchar(35) NOT NULL DEFAULT 'en', "userType" varchar CHECK( "userType" IN ('member','guest') ) NOT NULL DEFAULT 'member', "guestCode" varchar(4), "guestEnabled" boolean NOT NULL DEFAULT (1), CONSTRAINT "UQ_78a916df40e02a9deb1c4b75edb" UNIQUE ("username"), CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "UQ_a523588f5886a8b2eed2880a023" UNIQUE ("guestCode"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_user"("id", "username", "email", "isEmailVerified", "emailVerificationToken", "emailVerificationTokenExpiresAt", "createdAt", "updatedAt", "passwordResetToken", "passwordResetTokenExpiresAt", "externalIdentifier", "nfcKeySeedToken", "lastUsernameChangeAt", "creditBalance", "billingFactor", "deletedAt", "deleteAccountToken", "deleteAccountTokenExpiresAt", "deleteAccountRequestedAt", "lockedUntil", "failedLoginAttempts", "firstFailedLoginAt", "locale") SELECT "id", "username", "email", "isEmailVerified", "emailVerificationToken", "emailVerificationTokenExpiresAt", "createdAt", "updatedAt", "passwordResetToken", "passwordResetTokenExpiresAt", "externalIdentifier", "nfcKeySeedToken", "lastUsernameChangeAt", "creditBalance", "billingFactor", "deletedAt", "deleteAccountToken", "deleteAccountTokenExpiresAt", "deleteAccountRequestedAt", "lockedUntil", "failedLoginAttempts", "firstFailedLoginAt", "locale" FROM "user"`,
    );
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`ALTER TABLE "temporary_user" RENAME TO "user"`);

    await this.createBillingTriggers(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropBillingTriggers(queryRunner);

    await queryRunner.query(
      `CREATE TABLE "temporary_user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "username" text NOT NULL, "email" text NOT NULL, "isEmailVerified" boolean NOT NULL DEFAULT (0), "emailVerificationToken" text, "emailVerificationTokenExpiresAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "passwordResetToken" text, "passwordResetTokenExpiresAt" datetime, "externalIdentifier" text, "nfcKeySeedToken" text, "lastUsernameChangeAt" datetime, "creditBalance" integer NOT NULL DEFAULT (0), "billingFactor" integer NOT NULL DEFAULT (100), "deletedAt" datetime, "deleteAccountToken" text, "deleteAccountTokenExpiresAt" datetime, "deleteAccountRequestedAt" datetime, "lockedUntil" datetime, "failedLoginAttempts" integer NOT NULL DEFAULT 0, "firstFailedLoginAt" datetime, "locale" varchar(35) NOT NULL DEFAULT 'en', CONSTRAINT "UQ_78a916df40e02a9deb1c4b75edb" UNIQUE ("username"), CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"))`,
    );
    // Guest accounts cannot be represented in the pre-feature schema (email is NOT NULL
    // there and there is no userType), so they are dropped on rollback — mirroring the
    // auth-detail down() which filters out guest_otp rows. Their guest_otp credentials
    // were already removed by GuestAccountsAuthDetail1783310000000.down(), which runs
    // before this migration is rolled back.
    await queryRunner.query(
      `INSERT INTO "temporary_user"("id", "username", "email", "isEmailVerified", "emailVerificationToken", "emailVerificationTokenExpiresAt", "createdAt", "updatedAt", "passwordResetToken", "passwordResetTokenExpiresAt", "externalIdentifier", "nfcKeySeedToken", "lastUsernameChangeAt", "creditBalance", "billingFactor", "deletedAt", "deleteAccountToken", "deleteAccountTokenExpiresAt", "deleteAccountRequestedAt", "lockedUntil", "failedLoginAttempts", "firstFailedLoginAt", "locale") SELECT "id", "username", "email", "isEmailVerified", "emailVerificationToken", "emailVerificationTokenExpiresAt", "createdAt", "updatedAt", "passwordResetToken", "passwordResetTokenExpiresAt", "externalIdentifier", "nfcKeySeedToken", "lastUsernameChangeAt", "creditBalance", "billingFactor", "deletedAt", "deleteAccountToken", "deleteAccountTokenExpiresAt", "deleteAccountRequestedAt", "lockedUntil", "failedLoginAttempts", "firstFailedLoginAt", "locale" FROM "user" WHERE "userType" = 'member'`,
    );
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`ALTER TABLE "temporary_user" RENAME TO "user"`);

    await this.createBillingTriggers(queryRunner);
  }
}
