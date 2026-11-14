import { MigrationInterface, QueryRunner } from 'typeorm';
import { EmailTemplateType } from '@attraccess/database-entities';
import { refreshDefaultEmailTemplate } from '../migration-helpers/refresh-default-email-template';

export class RefreshSharedMachineReceipt1793000000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await refreshDefaultEmailTemplate(
      runner,
      EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
      [
        // Stock receipt before shared-machine shares and per-segment breakdowns.
        'b710311bb8552eba70b3c437c4e145e8b3459a0a00d2c45b40a20b3856c1db1a',
      ],
      [
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
    );
  }

  async down(): Promise<void> {
    // Preserve the readable receipt and administrator edits.
  }
}
