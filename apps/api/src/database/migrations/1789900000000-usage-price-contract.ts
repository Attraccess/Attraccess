import { MigrationInterface, QueryRunner } from 'typeorm';

export class UsagePriceContract1789900000000 implements MigrationInterface {
  name = 'UsagePriceContract1789900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Historical start prices cannot be reconstructed. Null keeps the legacy fallback explicit;
    // completed transactions and their item quantities/rates are never recalculated.
    await queryRunner.query('ALTER TABLE "resource_usage" ADD "creditsPerUsage" integer');
    await queryRunner.query('ALTER TABLE "resource_usage" ADD "billingFactor" integer');
    await queryRunner.query('ALTER TABLE "billing_transaction_item" ADD "durationMs" integer');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "billing_transaction_item" DROP COLUMN "durationMs"');
    await queryRunner.query('ALTER TABLE "resource_usage" DROP COLUMN "billingFactor"');
    await queryRunner.query('ALTER TABLE "resource_usage" DROP COLUMN "creditsPerUsage"');
  }
}
