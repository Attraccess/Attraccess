import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttractapResourceMapping1752243159017 implements MigrationInterface {
  name = 'AttractapResourceMapping1752243159017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "attractap_resources_resource" ("attractapId" integer NOT NULL, "resourceId" integer NOT NULL, PRIMARY KEY ("attractapId", "resourceId"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b64bbe84b8da177b4961263930" ON "attractap_resources_resource" ("attractapId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a3d2fdb6a25cac8b0555c2e727" ON "attractap_resources_resource" ("resourceId") `
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_attractap" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "apiTokenHash" text NOT NULL, "lastConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "firstConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_attractap"("id", "name", "apiTokenHash", "lastConnection", "firstConnection") SELECT "id", "name", "apiTokenHash", "lastConnection", "firstConnection" FROM "attractap"`
    );
    await queryRunner.query(`DROP TABLE "attractap"`);
    await queryRunner.query(`ALTER TABLE "temporary_attractap" RENAME TO "attractap"`);
    await queryRunner.query(`DROP INDEX "IDX_b64bbe84b8da177b4961263930"`);
    await queryRunner.query(`DROP INDEX "IDX_a3d2fdb6a25cac8b0555c2e727"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_attractap_resources_resource" ("attractapId" integer NOT NULL, "resourceId" integer NOT NULL, CONSTRAINT "FK_b64bbe84b8da177b49612639308" FOREIGN KEY ("attractapId") REFERENCES "attractap" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "FK_a3d2fdb6a25cac8b0555c2e727a" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, PRIMARY KEY ("attractapId", "resourceId"))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_attractap_resources_resource"("attractapId", "resourceId") SELECT "attractapId", "resourceId" FROM "attractap_resources_resource"`
    );
    await queryRunner.query(`DROP TABLE "attractap_resources_resource"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_attractap_resources_resource" RENAME TO "attractap_resources_resource"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b64bbe84b8da177b4961263930" ON "attractap_resources_resource" ("attractapId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a3d2fdb6a25cac8b0555c2e727" ON "attractap_resources_resource" ("resourceId") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_a3d2fdb6a25cac8b0555c2e727"`);
    await queryRunner.query(`DROP INDEX "IDX_b64bbe84b8da177b4961263930"`);
    await queryRunner.query(
      `ALTER TABLE "attractap_resources_resource" RENAME TO "temporary_attractap_resources_resource"`
    );
    await queryRunner.query(
      `CREATE TABLE "attractap_resources_resource" ("attractapId" integer NOT NULL, "resourceId" integer NOT NULL, PRIMARY KEY ("attractapId", "resourceId"))`
    );
    await queryRunner.query(
      `INSERT INTO "attractap_resources_resource"("attractapId", "resourceId") SELECT "attractapId", "resourceId" FROM "temporary_attractap_resources_resource"`
    );
    await queryRunner.query(`DROP TABLE "temporary_attractap_resources_resource"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_a3d2fdb6a25cac8b0555c2e727" ON "attractap_resources_resource" ("resourceId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b64bbe84b8da177b4961263930" ON "attractap_resources_resource" ("attractapId") `
    );
    await queryRunner.query(`ALTER TABLE "attractap" RENAME TO "temporary_attractap"`);
    await queryRunner.query(
      `CREATE TABLE "attractap" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "apiTokenHash" text NOT NULL, "hasAccessToResourceIds" text NOT NULL DEFAULT (''), "lastConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "firstConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
    );
    await queryRunner.query(
      `INSERT INTO "attractap"("id", "name", "apiTokenHash", "lastConnection", "firstConnection") SELECT "id", "name", "apiTokenHash", "lastConnection", "firstConnection" FROM "temporary_attractap"`
    );
    await queryRunner.query(`DROP TABLE "temporary_attractap"`);
    await queryRunner.query(`DROP INDEX "IDX_a3d2fdb6a25cac8b0555c2e727"`);
    await queryRunner.query(`DROP INDEX "IDX_b64bbe84b8da177b4961263930"`);
    await queryRunner.query(`DROP TABLE "attractap_resources_resource"`);
  }
}
