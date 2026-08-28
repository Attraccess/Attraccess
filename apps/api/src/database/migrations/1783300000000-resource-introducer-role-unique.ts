import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceIntroducerRoleUnique1783300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "resource_introducer" WHERE "resourceId" IS NOT NULL AND "id" NOT IN (SELECT MIN("id") FROM "resource_introducer" WHERE "resourceId" IS NOT NULL GROUP BY "resourceId", "userId", "type")`,
    );
    await queryRunner.query(
      `DELETE FROM "resource_introducer" WHERE "resourceGroupId" IS NOT NULL AND "id" NOT IN (SELECT MIN("id") FROM "resource_introducer" WHERE "resourceGroupId" IS NOT NULL GROUP BY "resourceGroupId", "userId", "type")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_resource_introducer_resource_user_type" ON "resource_introducer" ("resourceId", "userId", "type") WHERE "resourceId" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_resource_introducer_group_user_type" ON "resource_introducer" ("resourceGroupId", "userId", "type") WHERE "resourceGroupId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_resource_introducer_group_user_type"`);
    await queryRunner.query(`DROP INDEX "IDX_resource_introducer_resource_user_type"`);
  }
}
