import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailTemplatesLocale1782100000000 implements MigrationInterface {
  name = 'EmailTemplatesLocale1782100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // SQLite requires a full table recreation to change the primary key.
    await queryRunner.query(`
      CREATE TABLE "email_templates_new" (
        "type"      varchar(255) NOT NULL,
        "locale"    varchar(10)  NOT NULL DEFAULT 'en',
        "subject"   varchar(255) NOT NULL,
        "body"      text         NOT NULL,
        "variables" text         NOT NULL DEFAULT '',
        "createdAt" datetime     NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime     NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY ("type", "locale")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "email_templates_new" ("type", "locale", "subject", "body", "variables", "createdAt", "updatedAt")
      SELECT "type", 'en', "subject", "body", COALESCE("variables", ''), "createdAt", "updatedAt"
      FROM "email_templates"
    `);

    await queryRunner.query(`DROP TABLE "email_templates"`);
    await queryRunner.query(`ALTER TABLE "email_templates_new" RENAME TO "email_templates"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "email_templates_old" (
        "type"      varchar(255) NOT NULL,
        "subject"   varchar(255) NOT NULL,
        "body"      text         NOT NULL,
        "variables" text         NOT NULL DEFAULT '',
        "createdAt" datetime     NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime     NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY ("type")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "email_templates_old" ("type", "subject", "body", "variables", "createdAt", "updatedAt")
      SELECT "type", "subject", "body", "variables", "createdAt", "updatedAt"
      FROM "email_templates"
      WHERE "locale" = 'en'
    `);

    await queryRunner.query(`DROP TABLE "email_templates"`);
    await queryRunner.query(`ALTER TABLE "email_templates_old" RENAME TO "email_templates"`);
  }
}
