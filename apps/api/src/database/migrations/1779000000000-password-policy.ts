import { MigrationInterface, QueryRunner } from 'typeorm';

export class PasswordPolicy1779000000000 implements MigrationInterface {
  name = 'PasswordPolicy1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "password_policy" (
        "id" integer PRIMARY KEY NOT NULL,
        "minLength" integer NOT NULL DEFAULT (12),
        "maxLength" integer NOT NULL DEFAULT (128),
        "allowAllUnicode" boolean NOT NULL DEFAULT (1),
        "requireUppercase" boolean NOT NULL DEFAULT (0),
        "requireLowercase" boolean NOT NULL DEFAULT (0),
        "requireDigit" boolean NOT NULL DEFAULT (0),
        "requireSpecial" boolean NOT NULL DEFAULT (0),
        "checkHIBP" boolean NOT NULL DEFAULT (1),
        "checkCommonPasswords" boolean NOT NULL DEFAULT (1),
        "minZxcvbnScore" integer NOT NULL DEFAULT (3),
        "historySize" integer NOT NULL DEFAULT (0),
        "rotationDays" integer NOT NULL DEFAULT (0),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )`,
    );

    await queryRunner.query(
      `INSERT OR IGNORE INTO "password_policy" ("id") VALUES (1)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "password_policy"`);
  }
}
