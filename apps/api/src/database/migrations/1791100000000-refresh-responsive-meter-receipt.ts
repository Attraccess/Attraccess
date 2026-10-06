import { MigrationInterface, QueryRunner } from 'typeorm';
import { EmailTemplateType } from '@attraccess/database-entities';
import { refreshDefaultEmailTemplate } from '../migration-helpers/refresh-default-email-template';

export class RefreshResponsiveMeterReceipt1791100000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await refreshDefaultEmailTemplate(runner, EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, [
      // Previous generic-meter stock body, trimmed with LF line endings.
      'dab3f4f223ba8ace0de4c81ed20991208b39cb931a75c1322f1b56c9c3425a46',
    ]);
  }

  async down(): Promise<void> {
    // Retain the readable receipt and administrator edits on downgrade.
  }
}
