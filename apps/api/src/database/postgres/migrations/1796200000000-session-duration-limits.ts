import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Maximum session time and required duration estimate per machine (ATT-43). Every existing resource keeps today's
 * behaviour (no limit, no estimate) and every existing session has no automatic end: nothing is backfilled.
 */
export class SessionDurationLimits1796200000000 implements MigrationInterface {
  name = 'SessionDurationLimits1796200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource" ADD "maxSessionDurationMinutes" integer`);
    await queryRunner.query(
      `ALTER TABLE "resource" ADD "requireSessionDurationEstimate" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE "resource" ADD "defaultSessionDurationEstimateMinutes" integer`);
    await queryRunner.query(`ALTER TABLE "resource_usage" ADD "autoEndAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "resource_usage" ADD "maxAutoEndAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "resource_usage" ADD "estimatedDurationMinutes" integer`);
    await queryRunner.query(`ALTER TABLE "resource_usage" ADD "autoEndWarnedOffsetMinutes" integer`);
    // The auto-end job looks for running sessions that are due; only sessions with a deadline are indexed.
    await queryRunner.query(
      `CREATE INDEX "IDX_resource_usage_auto_end_at" ON "resource_usage" ("autoEndAt") WHERE "autoEndAt" IS NOT NULL AND "endTime" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_resource_usage_auto_end_at"`);
    await queryRunner.query(`ALTER TABLE "resource_usage" DROP COLUMN "autoEndWarnedOffsetMinutes"`);
    await queryRunner.query(`ALTER TABLE "resource_usage" DROP COLUMN "estimatedDurationMinutes"`);
    await queryRunner.query(`ALTER TABLE "resource_usage" DROP COLUMN "maxAutoEndAt"`);
    await queryRunner.query(`ALTER TABLE "resource_usage" DROP COLUMN "autoEndAt"`);
    await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "defaultSessionDurationEstimateMinutes"`);
    await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "requireSessionDurationEstimate"`);
    await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "maxSessionDurationMinutes"`);
  }
}
