import { MigrationInterface, QueryRunner } from 'typeorm';
import { EmailTemplateType } from '@attraccess/database-entities';
import { refreshDefaultEmailTemplate } from '../migration-helpers/refresh-default-email-template';

// Stock energy receipt and first generic-meter receipt, trimmed with LF line endings.
const PREVIOUS_BODY_HASHES = [
  '08932de65ce3334d43bb676deed46ba333e7a0f69145acfa06b6fd092a34a1b8',
  'dab3f4f223ba8ace0de4c81ed20991208b39cb931a75c1322f1b56c9c3425a46',
];

export class RefreshDefaultMeterReceipt1790400000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // Separate migration also reaches installations that already ran the billing replacement.
    await refreshDefaultEmailTemplate(
      runner,
      EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
      PREVIOUS_BODY_HASHES,
    );
  }

  async down(): Promise<void> {
    // Retain valid receipts and administrator edits on downgrade.
  }
}
