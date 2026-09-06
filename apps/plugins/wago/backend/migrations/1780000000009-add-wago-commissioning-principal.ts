import type { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class AddWagoCommissioningPrincipal1780000000009 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "initiating_principal" text');
    await queryRunner.query(
      'ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "runtime_artifact_digest" varchar',
    );
    await queryRunner.query(
      'ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "management_controller_id" integer',
    );
    await queryRunner.query(
      'ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "docker_provision_token" varchar',
    );
    await queryRunner.query(
      'ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "docker_provision_state" varchar',
    );
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" ADD COLUMN "platform_report" text');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query('SELECT COUNT(*) AS count FROM "plugin_wago_commissioning_sessions" WHERE "docker_provision_token" IS NOT NULL');
    if (Number(rows[0].count) !== 0) throw new Error('Recover Docker provisioning before removing its saved ownership tokens');
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" DROP COLUMN "initiating_principal"');
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" DROP COLUMN "runtime_artifact_digest"');
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" DROP COLUMN "management_controller_id"');
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" DROP COLUMN "docker_provision_token"');
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" DROP COLUMN "docker_provision_state"');
    await queryRunner.query('ALTER TABLE "plugin_wago_commissioning_sessions" DROP COLUMN "platform_report"');
  }
}
