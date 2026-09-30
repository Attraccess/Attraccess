import { MigrationInterface, QueryRunner } from 'typeorm';

export class MqttServerManagementPort1783800000000 implements MigrationInterface {
  name = 'MqttServerManagementPort1783800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mqtt_server" ADD COLUMN "managementPort" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mqtt_server" DROP COLUMN "managementPort"`);
  }
}
