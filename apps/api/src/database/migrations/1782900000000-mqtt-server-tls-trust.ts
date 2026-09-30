import { MigrationInterface, QueryRunner } from 'typeorm';

export class MqttServerTlsTrust1782900000000 implements MigrationInterface {
  name = 'MqttServerTlsTrust1782900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mqtt_server" ADD COLUMN "caCert" text`);
    await queryRunner.query(`ALTER TABLE "mqtt_server" ADD COLUMN "tlsInsecure" boolean NOT NULL DEFAULT (0)`);
    await queryRunner.query(`ALTER TABLE "mqtt_server" ADD COLUMN "tlsServername" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mqtt_server" DROP COLUMN "tlsServername"`);
    await queryRunner.query(`ALTER TABLE "mqtt_server" DROP COLUMN "tlsInsecure"`);
    await queryRunner.query(`ALTER TABLE "mqtt_server" DROP COLUMN "caCert"`);
  }
}
