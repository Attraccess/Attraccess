import { MigrationInterface, QueryRunner } from 'typeorm';

export class HotPathIndexes1782200000000 implements MigrationInterface {
  name = 'HotPathIndexes1782200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_resource_introduction_resourceId" ON "resource_introduction" ("resourceId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_resource_introduction_receiverUserId" ON "resource_introduction" ("receiverUserId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_resource_introduction_resourceGroupId" ON "resource_introduction" ("resourceGroupId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_resource_usage_resourceId" ON "resource_usage" ("resourceId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_resource_usage_endTime" ON "resource_usage" ("endTime")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_resource_usage_userId" ON "resource_usage" ("userId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_resource_usage_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_resource_usage_endTime"`);
    await queryRunner.query(`DROP INDEX "IDX_resource_usage_resourceId"`);
    await queryRunner.query(`DROP INDEX "IDX_resource_introduction_resourceGroupId"`);
    await queryRunner.query(`DROP INDEX "IDX_resource_introduction_receiverUserId"`);
    await queryRunner.query(`DROP INDEX "IDX_resource_introduction_resourceId"`);
  }
}
