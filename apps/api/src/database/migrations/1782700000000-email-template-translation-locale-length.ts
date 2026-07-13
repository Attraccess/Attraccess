import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailTemplateTranslationLocaleLength1782700000000 implements MigrationInterface {
  // ponytail: SQLite stores all varchar as TEXT and does not enforce length constraints,
  // so widening locale from 10→35 requires only a table-recreation to update the DDL label.
  // The entity uses length: 35; new installs get the correct DDL from 1782500000000 directly.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "email_template_translations_new" (
        "templateType" varchar(255) NOT NULL,
        "key"          varchar(500) NOT NULL,
        "locale"       varchar(35)  NOT NULL,
        "value"        text         NOT NULL,
        PRIMARY KEY ("templateType", "key", "locale")
      )
    `);
    await queryRunner.query(`INSERT INTO "email_template_translations_new" SELECT * FROM "email_template_translations"`);
    await queryRunner.query(`DROP TABLE "email_template_translations"`);
    await queryRunner.query(`ALTER TABLE "email_template_translations_new" RENAME TO "email_template_translations"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "email_template_translations_old" (
        "templateType" varchar(255) NOT NULL,
        "key"          varchar(500) NOT NULL,
        "locale"       varchar(10)  NOT NULL,
        "value"        text         NOT NULL,
        PRIMARY KEY ("templateType", "key", "locale")
      )
    `);
    await queryRunner.query(`INSERT INTO "email_template_translations_old" SELECT * FROM "email_template_translations"`);
    await queryRunner.query(`DROP TABLE "email_template_translations"`);
    await queryRunner.query(`ALTER TABLE "email_template_translations_old" RENAME TO "email_template_translations"`);
  }
}
