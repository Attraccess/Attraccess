import { MigrationInterface, QueryRunner } from 'typeorm';
import { EmailTemplateType } from '@attraccess/database-entities';
import { refreshDefaultEmailTemplate } from '../migration-helpers/refresh-default-email-template';

export class RefreshMeterReceiptTotals1791300000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await refreshDefaultEmailTemplate(runner, EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, [
      // Stock generic-meter receipt before maximum monetary totals could wrap.
      'e9dcb12184893c20ee844e96b2c4ebadece44b1cca9156f200448ad06ded6890',
    ]);
  }

  async down(): Promise<void> {
    // Preserve the readable receipt and administrator edits.
  }
}
