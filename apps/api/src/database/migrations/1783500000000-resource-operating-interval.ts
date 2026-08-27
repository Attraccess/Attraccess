import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceOperatingInterval1783500000000 implements MigrationInterface {
  name = 'ResourceOperatingInterval1783500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "resource_operating_interval" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "startTime" datetime NOT NULL, "endTime" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_resource_operating_interval_resource" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_resource_operating_interval_resourceId_endTime" ON "resource_operating_interval" ("resourceId", "endTime")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_resource_operating_interval_one_open" ON "resource_operating_interval" ("resourceId") WHERE "endTime" IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_resource_operating_interval_one_open"`);
    await queryRunner.query(`DROP INDEX "IDX_resource_operating_interval_resourceId_endTime"`);
    await queryRunner.query(`DROP TABLE "resource_operating_interval"`);
  }
}
