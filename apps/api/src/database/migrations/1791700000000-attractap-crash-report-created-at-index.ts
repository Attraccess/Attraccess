import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttractapCrashReportCreatedAtIndex1791700000000 implements MigrationInterface {
  name = 'AttractapCrashReportCreatedAtIndex1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_attractap_crash_report_created_at" ON "attractap_crash_report" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attractap_crash_report_created_at"`);
  }
}
