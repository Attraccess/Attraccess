import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailTemplateTranslationLocaleLength1782700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "email_template_translations" ALTER COLUMN "locale" TYPE varchar(35)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "email_template_translations" ALTER COLUMN "locale" TYPE varchar(10)`);
  }
}
