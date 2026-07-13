import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailTemplateTranslations1782500000000 implements MigrationInterface {
  name = 'EmailTemplateTranslations1782500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // locale is varchar(35) to fit the longest BCP-47 language tags
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_template_translations" (
        "templateType" varchar(255) NOT NULL,
        "key"          varchar(500) NOT NULL,
        "locale"       varchar(35)  NOT NULL,
        "value"        text         NOT NULL,
        PRIMARY KEY ("templateType", "key", "locale")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email_template_translations"`);
  }
}
