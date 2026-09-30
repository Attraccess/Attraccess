import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanionDeviceAppVersion1782203000000 implements MigrationInterface {
  name = 'CompanionDeviceAppVersion1782203000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companion_device" ADD COLUMN "appVersion" text NULL DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "companion_device" DROP COLUMN "appVersion"`);
  }
}
