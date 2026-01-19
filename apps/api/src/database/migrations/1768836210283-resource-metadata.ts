import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceMetadata1768836210283 implements MigrationInterface {
  name = 'ResourceMetadata1768836210283';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource" ADD COLUMN "metadata" json`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "metadata"`);
  }
}
