import { MigrationInterface, QueryRunner } from 'typeorm';
import { EmailTemplateType } from '@attraccess/database-entities';
import { SHIPPED_TRANSLATIONS } from '../../email-template/email-defaults';
import { refreshDefaultEmailTemplate } from '../migration-helpers/refresh-default-email-template';

export class RefreshMeterEvidenceReceipt1791200000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const type = EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY;
    if (
      !(await refreshDefaultEmailTemplate(
        runner,
        type,
        [
          // Responsive generic-meter stock body before unavailable evidence and word wrapping.
          '1b86b59951fe9b654b0124bf966e3bc7b0f2576761aef7f854339ebe6662475c',
        ],
        ['items[].isUnavailable'],
      ))
    )
      return;

    for (const translation of SHIPPED_TRANSLATIONS.filter((row) => row.templateType === type)) {
      await runner.query(
        'INSERT OR IGNORE INTO "email_template_translations" ("templateType", "key", "locale", "value") VALUES (?, ?, ?, ?)',
        [type, translation.key, translation.locale, translation.value],
      );
    }
  }

  async down(): Promise<void> {
    // Preserve receipt evidence, translations, and administrator edits.
  }
}
