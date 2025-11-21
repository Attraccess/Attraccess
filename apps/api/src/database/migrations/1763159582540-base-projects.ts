import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaseProjects1763159582540 implements MigrationInterface {
  name = 'BaseProjects1763159582540';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "project" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "name" text NOT NULL, "description" text, "logo" text, "userId" integer)`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_project" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "name" text NOT NULL, "description" text, "logo" text, "userId" integer, CONSTRAINT "FK_7c4b0d3b77eaf26f8b4da879e63" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_project"("id", "createdAt", "updatedAt", "name", "description", "logo", "userId") SELECT "id", "createdAt", "updatedAt", "name", "description", "logo", "userId" FROM "project"`,
    );
    await queryRunner.query(`DROP TABLE "project"`);
    await queryRunner.query(`ALTER TABLE "temporary_project" RENAME TO "project"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "project" RENAME TO "temporary_project"`);
    await queryRunner.query(
      `CREATE TABLE "project" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "name" text NOT NULL, "description" text, "logo" text, "userId" integer)`,
    );
    await queryRunner.query(
      `INSERT INTO "project"("id", "createdAt", "updatedAt", "name", "description", "logo", "userId") SELECT "id", "createdAt", "updatedAt", "name", "description", "logo", "userId" FROM "temporary_project"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_project"`);
    await queryRunner.query(`DROP TABLE "project"`);
  }
}
