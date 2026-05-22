import { MigrationInterface, QueryRunner } from 'typeorm';

export class PasswordPolicySliceC1779380000000 implements MigrationInterface {
  name = 'PasswordPolicySliceC1779380000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "password_policy_override" (
        "role" varchar CHECK ("role" IN ('admin')) PRIMARY KEY NOT NULL,
        "minLength" integer,
        "maxLength" integer,
        "allowAllUnicode" boolean,
        "requireUppercase" boolean,
        "requireLowercase" boolean,
        "requireDigit" boolean,
        "requireSpecial" boolean,
        "checkHIBP" boolean,
        "checkCommonPasswords" boolean,
        "minZxcvbnScore" integer,
        "historySize" integer,
        "rotationDays" integer,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "version" integer NOT NULL DEFAULT (1)
      )`,
    );

    await queryRunner.query(`ALTER TABLE "password_policy" ADD COLUMN "version" integer NOT NULL DEFAULT 1`);

    await queryRunner.query(
      `CREATE TABLE "password_policy_audit" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "at" datetime NOT NULL DEFAULT (datetime('now')),
        "event" varchar(64) NOT NULL,
        "actorId" integer,
        "actorUsername" varchar(255),
        "ip" varchar(45),
        "userAgent" varchar(512),
        "requestId" varchar(128),
        "role" varchar(64),
        "before" text,
        "after" text,
        "changedFields" text
      )`,
    );

    await queryRunner.query(`CREATE INDEX "IDX_password_policy_audit_at" ON "password_policy_audit" ("at")`);
    await queryRunner.query(`CREATE INDEX "IDX_password_policy_audit_actor" ON "password_policy_audit" ("actorId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_password_policy_audit_actor"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_password_policy_audit_at"`);
    await queryRunner.query(`DROP TABLE "password_policy_audit"`);
    await queryRunner.query(`ALTER TABLE "password_policy" DROP COLUMN "version"`);
    await queryRunner.query(`DROP TABLE "password_policy_override"`);
  }
}
