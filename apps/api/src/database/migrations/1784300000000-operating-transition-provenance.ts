import { MigrationInterface, QueryRunner } from 'typeorm';

export class OperatingTransitionProvenance1784300000000 implements MigrationInterface {
  name = 'OperatingTransitionProvenance1784300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Existing boundaries remain unknown; never infer provenance from today's flow configuration.
    await queryRunner.query(`ALTER TABLE "resource_operating_interval" ADD "startFlowNodeId" text`);
    await queryRunner.query(`ALTER TABLE "resource_operating_interval" ADD "startFlowRunId" text`);
    await queryRunner.query(`ALTER TABLE "resource_operating_interval" ADD "endFlowNodeId" text`);
    await queryRunner.query(`ALTER TABLE "resource_operating_interval" ADD "endFlowRunId" text`);
    await queryRunner.query(
      `CREATE INDEX "IDX_resource_operating_interval_resourceId_startTime_id" ON "resource_operating_interval" ("resourceId", "startTime", "id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_resource_operating_interval_resourceId_startTime_id"`);
    await queryRunner.query(`ALTER TABLE "resource_operating_interval" DROP COLUMN "endFlowRunId"`);
    await queryRunner.query(`ALTER TABLE "resource_operating_interval" DROP COLUMN "endFlowNodeId"`);
    await queryRunner.query(`ALTER TABLE "resource_operating_interval" DROP COLUMN "startFlowRunId"`);
    await queryRunner.query(`ALTER TABLE "resource_operating_interval" DROP COLUMN "startFlowNodeId"`);
  }
}
