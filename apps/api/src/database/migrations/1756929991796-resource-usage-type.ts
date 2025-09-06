import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceUsageType1756929991796 implements MigrationInterface {
  name = 'ResourceUsageType1756929991796';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "typeorm_metadata" WHERE "type" = ? AND "name" = ?`, [
      'VIEW',
      'resource_computed_view',
    ]);
    await queryRunner.query(`DROP VIEW "resource_computed_view"`);
    await queryRunner.query(`CREATE TABLE "temporary_resource_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer, "startTime" datetime NOT NULL DEFAULT (datetime('now')), "startNotes" text, "endTime" datetime, "endNotes" text, "usageInMinutes" integer NOT NULL AS (CASE 
      WHEN "endTime" IS NULL THEN -1
      ELSE (julianday("endTime") - julianday("startTime")) * 1440
    END) STORED, "usageType" varchar CHECK( "usageType" IN ('machine','door') ) NOT NULL, CONSTRAINT "FK_8177b2b424a6d31c533d57b95cc" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6f80e3fc0cf8bfce60e25a6805f" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
    await queryRunner.query(
      `INSERT INTO "temporary_resource_usage"("id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", "usageType") SELECT "id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", 'usage' FROM "resource_usage"`
    );
    await queryRunner.query(`DROP TABLE "resource_usage"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_usage" RENAME TO "resource_usage"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "description" text, "imageFilename" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "documentationType" text, "documentationMarkdown" text, "documentationUrl" text, "allowTakeOver" boolean NOT NULL DEFAULT (0), "type" varchar CHECK( "type" IN ('machine','door') ) NOT NULL)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource"("id", "name", "description", "imageFilename", "createdAt", "updatedAt", "documentationType", "documentationMarkdown", "documentationUrl", "allowTakeOver", "type") SELECT "id", "name", "description", "imageFilename", "createdAt", "updatedAt", "documentationType", "documentationMarkdown", "documentationUrl", "allowTakeOver", 'machine' FROM "resource"`
    );
    await queryRunner.query(`DROP TABLE "resource"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource" RENAME TO "resource"`);

    await queryRunner.query(
      `CREATE TABLE "temporary_resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar CHECK( "type" IN ('input.button','input.resource.usage.started','input.resource.usage.stopped','input.resource.usage.takeover','input.resource.door.unlocked','input.resource.door.locked','output.http.sendRequest','output.mqtt.sendMessage','processing.wait','processing.if') ) NOT NULL, "data" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL, CONSTRAINT "FK_ca3080b2dbc9c7c88a4a64c469d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_flow_node"("id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY") SELECT "id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY" FROM "resource_flow_node"`
    );
    await queryRunner.query(`DROP TABLE "resource_flow_node"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_flow_node" RENAME TO "resource_flow_node"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_flow_node" RENAME TO "temporary_resource_flow_node"`);
    await queryRunner.query(
      `CREATE TABLE "resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar CHECK( "type" IN ('input.button','input.resource.usage.started','input.resource.usage.stopped','input.resource.usage.takeover','output.http.sendRequest','output.mqtt.sendMessage','processing.wait','processing.if') ) NOT NULL, "data" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL, CONSTRAINT "FK_ca3080b2dbc9c7c88a4a64c469d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "resource_flow_node"("id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY") SELECT "id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY" FROM "temporary_resource_flow_node"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_flow_node"`);

    await queryRunner.query(`ALTER TABLE "resource" RENAME TO "temporary_resource"`);
    await queryRunner.query(
      `CREATE TABLE "resource" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "description" text, "imageFilename" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "documentationType" text, "documentationMarkdown" text, "documentationUrl" text, "allowTakeOver" boolean NOT NULL DEFAULT (0))`
    );
    await queryRunner.query(
      `INSERT INTO "resource"("id", "name", "description", "imageFilename", "createdAt", "updatedAt", "documentationType", "documentationMarkdown", "documentationUrl", "allowTakeOver") SELECT "id", "name", "description", "imageFilename", "createdAt", "updatedAt", "documentationType", "documentationMarkdown", "documentationUrl", "allowTakeOver" FROM "temporary_resource"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource"`);
    await queryRunner.query(`ALTER TABLE "resource_usage" RENAME TO "temporary_resource_usage"`);
    await queryRunner.query(`CREATE TABLE "resource_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer, "startTime" datetime NOT NULL DEFAULT (datetime('now')), "startNotes" text, "endTime" datetime, "endNotes" text, "usageInMinutes" integer NOT NULL AS (CASE 
      WHEN "endTime" IS NULL THEN -1
      ELSE (julianday("endTime") - julianday("startTime")) * 1440
    END) STORED, CONSTRAINT "FK_8177b2b424a6d31c533d57b95cc" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6f80e3fc0cf8bfce60e25a6805f" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
    await queryRunner.query(
      `INSERT INTO "resource_usage"("id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes") SELECT "id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes" FROM "temporary_resource_usage"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_usage"`);

    await queryRunner.query(
      `CREATE VIEW "resource_computed_view" AS SELECT "resource"."id" AS "id", COALESCE(SUM("usage"."usageInMinutes"), -1) AS "totalUsageMinutes" FROM "resource" "resource" LEFT JOIN "resource_usage" "usage" ON "usage"."resourceId" = "resource"."id" GROUP BY "resource"."id"`
    );
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES (NULL, NULL, NULL, ?, ?, ?)`,
      [
        'VIEW',
        'resource_computed_view',
        'SELECT "resource"."id" AS "id", COALESCE(SUM("usage"."usageInMinutes"), -1) AS "totalUsageMinutes" FROM "resource" "resource" LEFT JOIN "resource_usage" "usage" ON "usage"."resourceId" = "resource"."id" GROUP BY "resource"."id"',
      ]
    );
  }
}
