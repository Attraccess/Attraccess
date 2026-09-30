import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanionDeviceLocked1782202000000 implements MigrationInterface {
  name = 'CompanionDeviceLocked1782202000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companion_device" ADD COLUMN "locked" boolean NOT NULL DEFAULT (0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "companion_device" DROP COLUMN "locked"`);
  }
}
