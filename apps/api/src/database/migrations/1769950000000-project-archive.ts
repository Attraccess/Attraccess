import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProjectArchive1769950000000 implements MigrationInterface {
  name = 'ProjectArchive1769950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "project" ADD COLUMN "archivedAt" datetime`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "project" DROP COLUMN "archivedAt"`);
  }
}
