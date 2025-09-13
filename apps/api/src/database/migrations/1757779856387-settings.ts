import { MigrationInterface, QueryRunner } from 'typeorm';

export class Settings1757779856387 implements MigrationInterface {
  name = 'Settings1757779856387';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "setting" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "parent" text NOT NULL, "key" text NOT NULL, "value" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "settings_identifier" UNIQUE ("parent", "key"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "setting"`);
  }
}
