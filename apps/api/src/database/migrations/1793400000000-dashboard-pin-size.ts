import { MigrationInterface, QueryRunner } from 'typeorm';

export class DashboardPinSize1793400000000 implements MigrationInterface {
  name = 'DashboardPinSize1793400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dashboard_pin" ADD COLUMN "size" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dashboard_pin" DROP COLUMN "size"`);
  }
}
