import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceIntroducerType1779400000000 implements MigrationInterface {
  name = 'ResourceIntroducerType1779400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resource_introducer" ADD COLUMN "type" varchar CHECK( "type" IN ('introducer','maintainer') ) NOT NULL DEFAULT ('introducer')`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_introducer" DROP COLUMN "type"`);
  }
}
