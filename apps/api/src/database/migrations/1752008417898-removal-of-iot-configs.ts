import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemovalOfIotConfigs1752008417898 implements MigrationInterface {
  name = 'RemovalOfIotConfigs1752008417898';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "mqtt_resource_config"`);
    await queryRunner.query(`DROP TABLE "webhook_config"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
