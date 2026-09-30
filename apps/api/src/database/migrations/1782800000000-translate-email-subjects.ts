import { MigrationInterface, QueryRunner } from 'typeorm';
import { EmailTemplateType } from '@attraccess/database-entities';
import { EMAIL_TEMPLATE_DEFAULTS, SHIPPED_TRANSLATIONS } from '../../email-template/email-defaults';

// Subjects became translatable via {{t "subject" …}} helpers. This rewrites existing
// installs' subject column to the new form and seeds the German subject translations.
// English lives in the {{t}} defaults, so no en rows are stored.
const SUBJECT_KEYS = ['subject', 'subject_degraded', 'subject_recovered'];

export class TranslateEmailSubjects1782800000000 implements MigrationInterface {
  name = 'TranslateEmailSubjects1782800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const type of Object.values(EmailTemplateType)) {
      await queryRunner.query(`UPDATE "email_templates" SET "subject" = $1 WHERE "type" = $2`, [
        EMAIL_TEMPLATE_DEFAULTS[type].subject,
        type,
      ]);
    }

    const subjectRows = SHIPPED_TRANSLATIONS.filter((row) => SUBJECT_KEYS.includes(row.key));
    for (const row of subjectRows) {
      await queryRunner.query(
        `INSERT OR IGNORE INTO "email_template_translations" ("templateType", "key", "locale", "value") VALUES (?, ?, ?, ?)`,
        [row.templateType, row.key, row.locale, row.value],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Subject column is not reverted; only the seeded subject translations are removed.
    const subjectRows = SHIPPED_TRANSLATIONS.filter((row) => SUBJECT_KEYS.includes(row.key));
    for (const row of subjectRows) {
      await queryRunner.query(
        `DELETE FROM "email_template_translations" WHERE "templateType" = ? AND "key" = ? AND "locale" = ?`,
        [row.templateType, row.key, row.locale],
      );
    }
  }
}
