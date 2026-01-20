import { MigrationInterface, QueryRunner } from "typeorm";

export class UserPasswordReset1747403591279 implements MigrationInterface {
    name = 'UserPasswordReset1747403591279'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "temporary_user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "username" text NOT NULL, "email" text NOT NULL, "isEmailVerified" boolean NOT NULL DEFAULT (0), "emailVerificationToken" text, "emailVerificationTokenExpiresAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "canManageResources" boolean NOT NULL DEFAULT (0), "canManageSystemConfiguration" boolean NOT NULL DEFAULT (0), "canManageUsers" boolean NOT NULL DEFAULT (0), "passwordResetToken" text, "passwordResetTokenExpiresAt" datetime, CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "UQ_78a916df40e02a9deb1c4b75edb" UNIQUE ("username"))`);
        await queryRunner.query(`INSERT INTO "temporary_user"("id", "username", "email", "isEmailVerified", "emailVerificationToken", "emailVerificationTokenExpiresAt", "createdAt", "updatedAt", "canManageResources", "canManageSystemConfiguration", "canManageUsers") SELECT "id", "username", "email", "isEmailVerified", "emailVerificationToken", "emailVerificationTokenExpiresAt", "createdAt", "updatedAt", "canManageResources", "canManageSystemConfiguration", "canManageUsers" FROM "user"`);
        await queryRunner.query(`DROP TABLE "user"`);
        await queryRunner.query(`ALTER TABLE "temporary_user" RENAME TO "user"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "passwordResetToken"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "passwordResetTokenExpiresAt"`);
    }

}
