import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanionDeviceUniqueName1782201000000 implements MigrationInterface {
  name = 'CompanionDeviceUniqueName1782201000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_companion_device_name" ON "companion_device" ("name")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_companion_device_name"`);
  }
}
