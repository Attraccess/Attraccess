import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttractapCrashReportCreatedIndex1791600000000 implements MigrationInterface {
  name = 'AttractapCrashReportCreatedIndex1791600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX "IDX_attractap_crash_report_created" ON "attractap_crash_report" ("createdAt")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_attractap_crash_report_created"');
  }
}
