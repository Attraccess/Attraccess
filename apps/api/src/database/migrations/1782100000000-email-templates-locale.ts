import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailTemplateTranslations1782100000000 implements MigrationInterface {
  name = 'EmailTemplateTranslations1782100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_template_translations" (
        "templateType" varchar(255) NOT NULL,
        "key"          varchar(500) NOT NULL,
        "locale"       varchar(10)  NOT NULL,
        "value"        text         NOT NULL,
        PRIMARY KEY ("templateType", "key", "locale")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email_template_translations"`);
  }
}
