import { MigrationInterface, QueryRunner } from "typeorm";

export class ShorterPermissionsDbColumnNames1741793486503 implements MigrationInterface {
    name = 'ShorterPermissionsDbColumnNames1741793486503'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "temporary_user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "username" varchar NOT NULL, "email" varchar NOT NULL, "isEmailVerified" boolean NOT NULL DEFAULT (0), "emailVerificationToken" text, "emailVerificationTokenExpiresAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_78a916df40e02a9deb1c4b75edb" UNIQUE ("username"), CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"))`);
        await queryRunner.query(`INSERT INTO "temporary_user"("id", "username", "email", "isEmailVerified", "emailVerificationToken", "emailVerificationTokenExpiresAt", "createdAt", "updatedAt") SELECT "id", "username", "email", "isEmailVerified", "emailVerificationToken", "emailVerificationTokenExpiresAt", "createdAt", "updatedAt" FROM "user"`);
        await queryRunner.query(`DROP TABLE "user"`);
        await queryRunner.query(`ALTER TABLE "temporary_user" RENAME TO "user"`);
        await queryRunner.query(`CREATE TABLE "temporary_user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "username" varchar NOT NULL, "email" varchar NOT NULL, "isEmailVerified" boolean NOT NULL DEFAULT (0), "emailVerificationToken" text, "emailVerificationTokenExpiresAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "canManageResources" boolean NOT NULL DEFAULT (0), "canManageSystemConfiguration" boolean NOT NULL DEFAULT (0), CONSTRAINT "UQ_78a916df40e02a9deb1c4b75edb" UNIQUE ("username"), CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"))`);
        await queryRunner.query(`INSERT INTO "temporary_user"("id", "username", "email", "isEmailVerified", "emailVerificationToken", "emailVerificationTokenExpiresAt", "createdAt", "updatedAt") SELECT "id", "username", "email", "isEmailVerified", "emailVerificationToken", "emailVerificationTokenExpiresAt", "createdAt", "updatedAt" FROM "user"`);
        await queryRunner.query(`DROP TABLE "user"`);
        await queryRunner.query(`ALTER TABLE "temporary_user" RENAME TO "user"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "user" ADD COLUMN "systemPermissionsCanmanageresources" boolean NOT NULL DEFAULT (0)`
        );
        await queryRunner.query(
            `ALTER TABLE "user" ADD COLUMN "systemPermissionsCanmanagesystemconfiguration" boolean NOT NULL DEFAULT (0)`
        );
        await queryRunner.query(
            `UPDATE "user"
             SET "systemPermissionsCanmanageresources" = "canManageResources",
                 "systemPermissionsCanmanagesystemconfiguration" = "canManageSystemConfiguration"`
        );
    }

}
