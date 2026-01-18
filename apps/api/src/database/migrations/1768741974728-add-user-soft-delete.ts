import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserSoftDelete1768741974728 implements MigrationInterface {
  name = 'AddUserSoftDelete1768741974728';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "deletedAt" datetime`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "deleteAccountToken" text`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "deleteAccountTokenExpiresAt" datetime`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "deleteAccountRequestedAt" datetime`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" RENAME TO "temporary_user"`);
    await queryRunner.query(
      `CREATE TABLE "user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "username" text NOT NULL, "email" text NOT NULL, "isEmailVerified" boolean NOT NULL DEFAULT (0), "emailVerificationToken" text, "emailVerificationTokenExpiresAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "canManageResources" boolean NOT NULL DEFAULT (0), "canManageSystemConfiguration" boolean NOT NULL DEFAULT (0), "canManageUsers" boolean NOT NULL DEFAULT (0), "canManageBilling" boolean NOT NULL DEFAULT (0), "passwordResetToken" text, "passwordResetTokenExpiresAt" datetime, "externalIdentifier" text, "nfcKeySeedToken" text, "lastUsernameChangeAt" datetime, "creditBalance" integer NOT NULL DEFAULT (0), "billingFactor" integer NOT NULL DEFAULT (100), CONSTRAINT "UQ_78a916df40e02a9deb1c4b75edb" UNIQUE ("username"), CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"))`,
    );
    await queryRunner.query(
      `INSERT INTO "user"("id", "username", "email", "isEmailVerified", "emailVerificationToken", "emailVerificationTokenExpiresAt", "createdAt", "updatedAt", "canManageResources", "canManageSystemConfiguration", "canManageUsers", "canManageBilling", "passwordResetToken", "passwordResetTokenExpiresAt", "externalIdentifier", "nfcKeySeedToken", "lastUsernameChangeAt", "creditBalance", "billingFactor") SELECT "id", "username", "email", "isEmailVerified", "emailVerificationToken", "emailVerificationTokenExpiresAt", "createdAt", "updatedAt", "canManageResources", "canManageSystemConfiguration", "canManageUsers", "canManageBilling", "passwordResetToken", "passwordResetTokenExpiresAt", "externalIdentifier", "nfcKeySeedToken", "lastUsernameChangeAt", "creditBalance", "billingFactor" FROM "temporary_user"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_user"`);
  }
}
