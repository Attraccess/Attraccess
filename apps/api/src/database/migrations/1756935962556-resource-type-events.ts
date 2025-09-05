import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceTypeEvents1756935962556 implements MigrationInterface {
  name = 'ResourceTypeEvents1756935962556';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "temporary_resource_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer, "startTime" datetime NOT NULL DEFAULT (datetime('now')), "startNotes" text, "endTime" datetime, "endNotes" text, "usageInMinutes" integer NOT NULL AS (CASE 
      WHEN "endTime" IS NULL THEN -1
      ELSE (julianday("endTime") - julianday("startTime")) * 1440
    END) STORED, "usageAction" varchar CHECK( "usageAction" IN ('machine','door') ) NOT NULL, CONSTRAINT "FK_6f80e3fc0cf8bfce60e25a6805f" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_8177b2b424a6d31c533d57b95cc" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
    await queryRunner.query(
      `INSERT INTO "temporary_resource_usage"("id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", "usageAction") SELECT "id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", "usageType" FROM "resource_usage"`
    );
    await queryRunner.query(`DROP TABLE "resource_usage"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_usage" RENAME TO "resource_usage"`);

    await queryRunner.query(`CREATE TABLE "temporary_resource_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer, "startTime" datetime NOT NULL DEFAULT (datetime('now')), "startNotes" text, "endTime" datetime, "endNotes" text, "usageInMinutes" integer NOT NULL AS (CASE 
      WHEN "endTime" IS NULL THEN -1
      ELSE (julianday("endTime") - julianday("startTime")) * 1440
    END) STORED, "usageAction" varchar CHECK( "usageAction" IN ('usage','door.lock','door.unlock','door.unlatch') ) NOT NULL, CONSTRAINT "FK_6f80e3fc0cf8bfce60e25a6805f" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_8177b2b424a6d31c533d57b95cc" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
    await queryRunner.query(
      `INSERT INTO "temporary_resource_usage"("id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", "usageAction") SELECT "id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", "usageAction" FROM "resource_usage"`
    );
    await queryRunner.query(`DROP TABLE "resource_usage"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_usage" RENAME TO "resource_usage"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar CHECK( "type" IN ('input.button','input.resource.usage.started','input.resource.usage.stopped','input.resource.usage.takeover','input.resource.door.unlocked','input.resource.door.locked','input.resource.door.unlatched','output.http.sendRequest','output.mqtt.sendMessage','processing.wait','processing.if') ) NOT NULL, "data" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL, CONSTRAINT "FK_ca3080b2dbc9c7c88a4a64c469d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
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
      `CREATE TABLE "resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar CHECK( "type" IN ('input.button','input.resource.usage.started','input.resource.usage.stopped','input.resource.usage.takeover','input.resource.door.unlocked','input.resource.door.locked','output.http.sendRequest','output.mqtt.sendMessage','processing.wait','processing.if') ) NOT NULL, "data" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL, CONSTRAINT "FK_ca3080b2dbc9c7c88a4a64c469d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "resource_flow_node"("id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY") SELECT "id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY" FROM "temporary_resource_flow_node"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_flow_node"`);
    await queryRunner.query(`ALTER TABLE "resource_usage" RENAME TO "temporary_resource_usage"`);
    await queryRunner.query(`CREATE TABLE "resource_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer, "startTime" datetime NOT NULL DEFAULT (datetime('now')), "startNotes" text, "endTime" datetime, "endNotes" text, "usageInMinutes" integer NOT NULL AS (CASE 
      WHEN "endTime" IS NULL THEN -1
      ELSE (julianday("endTime") - julianday("startTime")) * 1440
    END) STORED, "usageAction" varchar CHECK( "usageAction" IN ('machine','door') ) NOT NULL, CONSTRAINT "FK_6f80e3fc0cf8bfce60e25a6805f" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_8177b2b424a6d31c533d57b95cc" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
    await queryRunner.query(
      `INSERT INTO "resource_usage"("id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", "usageAction") SELECT "id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", "usageAction" FROM "temporary_resource_usage"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_usage"`);

    await queryRunner.query(`ALTER TABLE "resource_usage" RENAME TO "temporary_resource_usage"`);
    await queryRunner.query(`CREATE TABLE "resource_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer, "startTime" datetime NOT NULL DEFAULT (datetime('now')), "startNotes" text, "endTime" datetime, "endNotes" text, "usageInMinutes" integer NOT NULL AS (CASE 
      WHEN "endTime" IS NULL THEN -1
      ELSE (julianday("endTime") - julianday("startTime")) * 1440
    END) STORED, "usageType" varchar CHECK( "usageType" IN ('machine','door') ) NOT NULL, CONSTRAINT "FK_6f80e3fc0cf8bfce60e25a6805f" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_8177b2b424a6d31c533d57b95cc" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
    await queryRunner.query(
      `INSERT INTO "resource_usage"("id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", "usageType") SELECT "id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", "usageAction" FROM "temporary_resource_usage"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_usage"`);
  }
}
