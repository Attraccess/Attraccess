import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceGroupIsHidden1781400000000 implements MigrationInterface {
  name = 'ResourceGroupIsHidden1781400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_group" ADD COLUMN "isHidden" boolean NOT NULL DEFAULT (0)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_group" DROP COLUMN "isHidden"`);
  }
}
