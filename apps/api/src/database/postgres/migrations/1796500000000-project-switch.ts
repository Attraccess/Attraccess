import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Switching the project of a running session (ATT-1421). A switch ends the current usage and continues it in a new
 * one that links back through `previousUsageId`. Nothing is backfilled: every existing session is a session of its
 * own, every existing resource charges continuations in the default mode, and no existing form is required on a
 * switch.
 */
export class ProjectSwitch1796500000000 implements MigrationInterface {
  name = 'ProjectSwitch1796500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_usage" ADD "previousUsageId" integer`);
    await queryRunner.query(`ALTER TABLE "resource_usage" ADD "projectSwitchCharging" character varying`);
    await queryRunner.query(`ALTER TABLE "resource_usage" ADD "sessionStartTime" TIMESTAMP WITH TIME ZONE`);
    // One continuation per part: two racing switches can never both continue the same session.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_resource_usage_previous_usage" ON "resource_usage" ("previousUsageId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "resource_usage" ADD CONSTRAINT "FK_resource_usage_previous_usage" FOREIGN KEY ("previousUsageId") REFERENCES "resource_usage"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "resource_billing_configuration" ADD "projectSwitchCharging" character varying NOT NULL DEFAULT 'continue'`,
    );
    await queryRunner.query(
      `ALTER TABLE "form" ADD "isRequiredOnResourceUsageProjectSwitch" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_resource_override" ADD "isRequiredOnResourceUsageProjectSwitch" boolean`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form_resource_override" DROP COLUMN "isRequiredOnResourceUsageProjectSwitch"`,
    );
    await queryRunner.query(`ALTER TABLE "form" DROP COLUMN "isRequiredOnResourceUsageProjectSwitch"`);
    await queryRunner.query(`ALTER TABLE "resource_billing_configuration" DROP COLUMN "projectSwitchCharging"`);
    await queryRunner.query(`ALTER TABLE "resource_usage" DROP CONSTRAINT "FK_resource_usage_previous_usage"`);
    await queryRunner.query(`DROP INDEX "IDX_resource_usage_previous_usage"`);
    await queryRunner.query(`ALTER TABLE "resource_usage" DROP COLUMN "sessionStartTime"`);
    await queryRunner.query(`ALTER TABLE "resource_usage" DROP COLUMN "projectSwitchCharging"`);
    await queryRunner.query(`ALTER TABLE "resource_usage" DROP COLUMN "previousUsageId"`);
  }
}
