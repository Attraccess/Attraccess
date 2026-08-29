import { MigrationInterface, QueryRunner } from 'typeorm';

export class OperatingDurationBillingAndMaintenance1783600000000 implements MigrationInterface {
  name = 'OperatingDurationBillingAndMaintenance1783600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resource_billing_configuration" ADD "creditsPerOperatingMinute" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "resource_usage" ADD "attributedOperatingDurationInMinutes" float`,
    );
    await queryRunner.query(
      `ALTER TABLE "resource_usage" ADD "sessionDurationCreditsPerMinute" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "resource_usage" ADD "operatingDurationCreditsPerMinute" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "resource_maintenance_schedule" ADD "durationBasis" varchar NOT NULL DEFAULT 'SESSION_DURATION'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_maintenance_schedule" DROP COLUMN "durationBasis"`);
    await queryRunner.query(`ALTER TABLE "resource_usage" DROP COLUMN "operatingDurationCreditsPerMinute"`);
    await queryRunner.query(`ALTER TABLE "resource_usage" DROP COLUMN "sessionDurationCreditsPerMinute"`);
    await queryRunner.query(`ALTER TABLE "resource_usage" DROP COLUMN "attributedOperatingDurationInMinutes"`);
    await queryRunner.query(`ALTER TABLE "resource_billing_configuration" DROP COLUMN "creditsPerOperatingMinute"`);
  }
}
