import { MigrationInterface, QueryRunner } from 'typeorm';
import { EmailTemplateType } from '@attraccess/database-entities';
import { refreshDefaultEmailTemplate } from '../migration-helpers/refresh-default-email-template';

export class RefreshMeterEvidenceReceipt1791200000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await refreshDefaultEmailTemplate(
      runner,
      EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
      [
        // Responsive generic-meter stock body before unavailable evidence and word wrapping.
        '1b86b59951fe9b654b0124bf966e3bc7b0f2576761aef7f854339ebe6662475c',
      ],
      ['items[].isUnavailable'],
    );
  }

  async down(): Promise<void> {
    // Preserve receipt evidence and administrator edits.
  }
}
