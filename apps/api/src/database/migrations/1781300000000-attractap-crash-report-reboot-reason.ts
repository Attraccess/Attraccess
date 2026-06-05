import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttractapCrashReportRebootReason1781300000000 implements MigrationInterface {
  name = 'AttractapCrashReportRebootReason1781300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attractap_crash_report" ADD COLUMN "rebootReason" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attractap_crash_report" DROP COLUMN "rebootReason"`);
  }
}
