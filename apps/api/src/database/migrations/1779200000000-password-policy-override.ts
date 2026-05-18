import { MigrationInterface, QueryRunner } from 'typeorm';

export class PasswordPolicyOverride1779200000000 implements MigrationInterface {
  name = 'PasswordPolicyOverride1779200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "password_policy_override" (
        "role" varchar CHECK ("role" IN ('admin','machine','api-token')) PRIMARY KEY NOT NULL,
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
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "password_policy_override"`);
  }
}
