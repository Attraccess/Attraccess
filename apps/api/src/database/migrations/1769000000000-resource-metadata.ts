import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceMetadata1769000000000 implements MigrationInterface {
  name = 'ResourceMetadata1769000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource" ADD COLUMN "metadata" json`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "metadata"`);
  }
}
