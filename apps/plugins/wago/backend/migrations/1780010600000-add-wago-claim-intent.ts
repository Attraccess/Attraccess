import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

export class AddWagoClaimIntent1780010600000 implements MigrationInterface {
  name = 'AddWagoClaimIntent1780010600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "plugin_wago_controllers" ADD COLUMN "credential_mqtt_server_id" integer');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      'SELECT 1 FROM "plugin_wago_controllers" WHERE "credential_mqtt_server_id" IS NOT NULL LIMIT 1',
    );
    if (rows.length) throw new Error('Revoke tracked WAGO credentials before removing claim recovery metadata.');
    await queryRunner.query('ALTER TABLE "plugin_wago_controllers" DROP COLUMN "credential_mqtt_server_id"');
  }
}
