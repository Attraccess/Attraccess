import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indexes for the batched maintenance schedule evaluation (ATT-582).
 * `resource_maintenance` had no indexes at all, so the bulk baseline/active-maintenance queries
 * full-scanned it; the usage aggregate joins on (resourceId, endTime) and could only use one of
 * the two existing single-column indexes.
 */
export class MaintenanceEvaluatorIndexes1782902000000 implements MigrationInterface {
  name = 'MaintenanceEvaluatorIndexes1782902000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_resource_usage_resourceId_endTime" ON "resource_usage" ("resourceId", "endTime")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_resource_maintenance_scheduleId_endTime" ON "resource_maintenance" ("maintenanceScheduleId", "endTime")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_resource_maintenance_resourceId_endTime" ON "resource_maintenance" ("resourceId", "endTime")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_maintenance_resourceId_endTime"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_maintenance_scheduleId_endTime"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_usage_resourceId_endTime"`);
  }
}
