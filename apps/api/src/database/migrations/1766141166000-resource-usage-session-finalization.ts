import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceUsageSessionFinalization1766141166000 implements MigrationInterface {
  name = 'ResourceUsageSessionFinalization1766141166000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_usage" ADD "isFinalized" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`UPDATE "resource_usage" SET "isFinalized" = true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_usage" DROP COLUMN "isFinalized"`);
  }
}
