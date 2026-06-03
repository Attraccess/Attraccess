import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttractapCrashReportSymbolication1780200000000 implements MigrationInterface {
  name = 'AttractapCrashReportSymbolication1780200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attractap_crash_report" ADD COLUMN "coredumpBuildId" text`);
    await queryRunner.query(`ALTER TABLE "attractap_crash_report" ADD COLUMN "symbolicationStatus" text`);
    await queryRunner.query(`ALTER TABLE "attractap_crash_report" ADD COLUMN "symbolizedBacktrace" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attractap_crash_report" DROP COLUMN "symbolizedBacktrace"`);
    await queryRunner.query(`ALTER TABLE "attractap_crash_report" DROP COLUMN "symbolicationStatus"`);
    await queryRunner.query(`ALTER TABLE "attractap_crash_report" DROP COLUMN "coredumpBuildId"`);
  }
}
