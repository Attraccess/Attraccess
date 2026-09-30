import { createHash } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { EmailTemplateType } from '@attraccess/database-entities';
import {
  EMAIL_TEMPLATE_DEFAULTS,
  readDefaultTemplateBody,
  SHIPPED_TRANSLATIONS,
} from '../../email-template/email-defaults';

// Original shipped receipt fragment, trimmed and with LF line endings.
const ORIGINAL_BODY_SHA256 = '16aac49e4c46f722a1092f0df87ad6059fb87becd0f042b370b8774ad814f0a2';

export class RefreshDefaultUsageReceipt1789900001000 implements MigrationInterface {
  name = 'RefreshDefaultUsageReceipt1789900001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const type = EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY;
    const [template]: Array<{ body: string; variables: string }> = await queryRunner.query(
      `SELECT "body", "variables" FROM "email_templates" WHERE "type" = ?`,
      [type],
    );
    if (!template) {
      return;
    }

    const hash = createHash('sha256').update(template.body.replace(/\r\n?/g, '\n').trim()).digest('hex');
    if (hash === ORIGINAL_BODY_SHA256) {
      const variables = [...new Set([...template.variables.split(','), ...EMAIL_TEMPLATE_DEFAULTS[type].variables])];
      // Match the read body so an administrator edit made concurrently wins.
      await queryRunner.query(
        `UPDATE "email_templates" SET "body" = ?, "variables" = ? WHERE "type" = ? AND "body" = ? AND "variables" = ?`,
        [readDefaultTemplateBody(type), variables.join(','), type, template.body, template.variables],
      );
    }

    for (const translation of SHIPPED_TRANSLATIONS.filter((row) => row.templateType === type)) {
      await queryRunner.query(
        `INSERT OR IGNORE INTO "email_template_translations" ("templateType", "key", "locale", "value") VALUES (?, ?, ?, ?)`,
        [type, translation.key, translation.locale, translation.value],
      );
    }
  }

  public async down(): Promise<void> {
    // Keep valid receipt templates and translations, including administrator edits.
    // The duration details are optional, so older transaction items still render.
  }
}
