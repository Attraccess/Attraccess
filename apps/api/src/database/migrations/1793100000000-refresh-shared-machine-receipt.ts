import { MigrationInterface, QueryRunner } from 'typeorm';
import { EmailTemplateType } from '@attraccess/database-entities';
import { SHIPPED_TRANSLATIONS } from '../../email-template/email-defaults';
import { refreshDefaultEmailTemplate } from '../migration-helpers/refresh-default-email-template';

/** Receipt texts introduced with shared-machine billing. Older keys keep whatever administrators did with them. */
const NEW_KEYS = [
  'shared_marker',
  'share_of_meter',
  'share_of_time',
  'segment_meter',
  'segment_time',
  'meter_share_pending',
  'quantity_pending',
];

export class RefreshSharedMachineReceipt1793100000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const type = EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY;
    if (
      !(await refreshDefaultEmailTemplate(
        runner,
        type,
        [
          // Stock receipt before shared-machine shares and per-segment breakdowns.
          'b710311bb8552eba70b3c437c4e145e8b3459a0a00d2c45b40a20b3856c1db1a',
        ],
        [
          'items[].isSharePending',
          'items[].isShared',
          'items[].isSharedMeter',
          'items[].isSharedOperatingTime',
          'items[].shareQuantity',
          'items[].totalQuantity',
          'items[].segments[].startedAt',
          'items[].segments[].endedAt',
          'items[].segments[].participants',
          'items[].segments[].totalQuantity',
          'items[].segments[].totalCredits',
          'items[].segments[].shareQuantity',
          'items[].segments[].shareCredits',
        ],
      ))
    )
      return;

    // A customized body may adopt the new texts later; their translations are there for it.
    for (const translation of SHIPPED_TRANSLATIONS.filter(
      (row) => row.templateType === type && NEW_KEYS.includes(row.key),
    )) {
      await runner.query(
        'INSERT OR IGNORE INTO "email_template_translations" ("templateType", "key", "locale", "value") VALUES (?, ?, ?, ?)',
        [type, translation.key, translation.locale, translation.value],
      );
    }
  }

  async down(): Promise<void> {
    // Preserve the readable receipt, its translations and administrator edits.
  }
}
