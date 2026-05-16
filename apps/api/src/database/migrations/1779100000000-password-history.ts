import { MigrationInterface, QueryRunner } from 'typeorm';

export class PasswordHistory1779100000000 implements MigrationInterface {
  name = 'PasswordHistory1779100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "password_history" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL,
        "passwordHash" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_password_history_user" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_password_history_user_created" ON "password_history" ("userId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_password_history_user_created"`);
    await queryRunner.query(`DROP TABLE "password_history"`);
  }
}
