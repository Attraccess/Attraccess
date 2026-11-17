import { MigrationInterface, QueryRunner } from 'typeorm';

/** Chunked coredump upload (ATT-1144): a report can wait for its dump. */
export class AttractapCrashReportCoredumpUpload1793500000000 implements MigrationInterface {
  name = 'AttractapCrashReportCoredumpUpload1793500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attractap_crash_report" ADD COLUMN "coredumpStatus" text`);
    await queryRunner.query(`ALTER TABLE "attractap_crash_report" ADD COLUMN "coredumpExpectedSize" integer`);
    await queryRunner.query(`ALTER TABLE "attractap_crash_report" ADD COLUMN "coredumpExpectedCrc32" integer`);
    // Reports from before chunked uploads carried their dump inline.
    await queryRunner.query(
      `UPDATE "attractap_crash_report" SET "coredumpStatus" = 'stored' WHERE "coredumpSize" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attractap_crash_report" DROP COLUMN "coredumpExpectedCrc32"`);
    await queryRunner.query(`ALTER TABLE "attractap_crash_report" DROP COLUMN "coredumpExpectedSize"`);
    await queryRunner.query(`ALTER TABLE "attractap_crash_report" DROP COLUMN "coredumpStatus"`);
  }
}
