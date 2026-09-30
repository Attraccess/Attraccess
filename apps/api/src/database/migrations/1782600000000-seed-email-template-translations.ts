import { MigrationInterface, QueryRunner } from 'typeorm';
import { EmailTemplateType } from '@attraccess/database-entities';
import { EMAIL_TEMPLATE_DEFAULTS, readDefaultTemplateBody, SHIPPED_TRANSLATIONS } from '../../email-template/email-defaults';

export class SeedEmailTemplateTranslations1782600000000 implements MigrationInterface {
  name = 'SeedEmailTemplateTranslations1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const row of SHIPPED_TRANSLATIONS) {
      await queryRunner.query(
        `INSERT OR IGNORE INTO "email_template_translations" ("templateType", "key", "locale", "value") VALUES (?, ?, ?, ?)`,
        [row.templateType, row.key, row.locale, row.value],
      );
    }

    // Replace every template with its {{t}}-based default from the .mjml asset files.
    for (const type of Object.values(EmailTemplateType)) {
      await queryRunner.query(
        `UPDATE "email_templates" SET "body" = $1, "variables" = $2, "subject" = $3 WHERE "type" = $4`,
        [
          readDefaultTemplateBody(type),
          EMAIL_TEMPLATE_DEFAULTS[type].variables.join(','),
          EMAIL_TEMPLATE_DEFAULTS[type].subject,
          type,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Template bodies are not reverted; only the seeded translations are removed.
    for (const row of SHIPPED_TRANSLATIONS) {
      await queryRunner.query(
        `DELETE FROM "email_template_translations" WHERE "templateType" = ? AND "key" = ? AND "locale" = ?`,
        [row.templateType, row.key, row.locale],
      );
    }
  }
}
