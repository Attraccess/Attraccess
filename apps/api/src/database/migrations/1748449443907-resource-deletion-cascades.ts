import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceDeletionCascades1748449443907 implements MigrationInterface {
  name = 'ResourceDeletionCascades1748449443907';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "typeorm_metadata" WHERE "type" = ? AND "name" = ?`, [
      'VIEW',
      'resource_computed_view',
    ]);
    await queryRunner.query(`DROP VIEW "resource_computed_view"`);

    await queryRunner.query(`CREATE TABLE "temporary_resource_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer, "startTime" datetime NOT NULL DEFAULT (datetime('now')), "startNotes" text, "endTime" datetime, "endNotes" text, "usageInMinutes" integer NOT NULL AS (CASE 
      WHEN "endTime" IS NULL THEN -1
      ELSE (julianday("endTime") - julianday("startTime")) * 1440
    END) STORED, CONSTRAINT "FK_6f80e3fc0cf8bfce60e25a6805f" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
    await queryRunner.query(
      `INSERT INTO "temporary_resource_usage"("id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes") SELECT "id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes" FROM "resource_usage"`
    );
    await queryRunner.query(`DROP TABLE "resource_usage"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_usage" RENAME TO "resource_usage"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_introduction_user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer NOT NULL, "grantedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceGroupId" integer, CONSTRAINT "FK_c2d6d85b029dbc3a18432ac0475" FOREIGN KEY ("resourceGroupId") REFERENCES "resource_group" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_12a2193fc2a76b7cbc8fcb1aef8" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_introduction_user"("id", "resourceId", "userId", "grantedAt", "resourceGroupId") SELECT "id", "resourceId", "userId", "grantedAt", "resourceGroupId" FROM "resource_introduction_user"`
    );
    await queryRunner.query(`DROP TABLE "resource_introduction_user"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_resource_introduction_user" RENAME TO "resource_introduction_user"`
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_mqtt_resource_config" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "serverId" integer NOT NULL, "inUseTopic" text NOT NULL, "inUseMessage" text NOT NULL, "notInUseTopic" text NOT NULL, "notInUseMessage" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "name" text NOT NULL, CONSTRAINT "FK_6ea7fa73bd2eb020ae6fc7206a3" FOREIGN KEY ("serverId") REFERENCES "mqtt_server" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_mqtt_resource_config"("id", "resourceId", "serverId", "inUseTopic", "inUseMessage", "notInUseTopic", "notInUseMessage", "createdAt", "updatedAt", "name") SELECT "id", "resourceId", "serverId", "inUseTopic", "inUseMessage", "notInUseTopic", "notInUseMessage", "createdAt", "updatedAt", "name" FROM "mqtt_resource_config"`
    );
    await queryRunner.query(`DROP TABLE "mqtt_resource_config"`);
    await queryRunner.query(`ALTER TABLE "temporary_mqtt_resource_config" RENAME TO "mqtt_resource_config"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_webhook_config" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "name" text NOT NULL, "url" text NOT NULL, "method" text NOT NULL, "headers" text, "inUseTemplate" text NOT NULL, "notInUseTemplate" text NOT NULL, "active" boolean NOT NULL DEFAULT (1), "retryEnabled" boolean NOT NULL DEFAULT (0), "maxRetries" integer NOT NULL DEFAULT (3), "retryDelay" integer NOT NULL DEFAULT (1000), "secret" text, "signatureHeader" text NOT NULL DEFAULT ('X-Webhook-Signature'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_webhook_config"("id", "resourceId", "name", "url", "method", "headers", "inUseTemplate", "notInUseTemplate", "active", "retryEnabled", "maxRetries", "retryDelay", "secret", "signatureHeader", "createdAt", "updatedAt") SELECT "id", "resourceId", "name", "url", "method", "headers", "inUseTemplate", "notInUseTemplate", "active", "retryEnabled", "maxRetries", "retryDelay", "secret", "signatureHeader", "createdAt", "updatedAt" FROM "webhook_config"`
    );
    await queryRunner.query(`DROP TABLE "webhook_config"`);
    await queryRunner.query(`ALTER TABLE "temporary_webhook_config" RENAME TO "webhook_config"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_introduction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "receiverUserId" integer NOT NULL, "tutorUserId" integer, "completedAt" datetime NOT NULL DEFAULT (datetime('now')), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceGroupId" integer, CONSTRAINT "FK_c99fa831a952f9954fa435705ba" FOREIGN KEY ("resourceGroupId") REFERENCES "resource_group" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_bef5cdb0c4699414e813acfb683" FOREIGN KEY ("tutorUserId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_275626e28c839888d63e6a7d2c1" FOREIGN KEY ("receiverUserId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_introduction"("id", "resourceId", "receiverUserId", "tutorUserId", "completedAt", "createdAt", "resourceGroupId") SELECT "id", "resourceId", "receiverUserId", "tutorUserId", "completedAt", "createdAt", "resourceGroupId" FROM "resource_introduction"`
    );
    await queryRunner.query(`DROP TABLE "resource_introduction"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_introduction" RENAME TO "resource_introduction"`);
    await queryRunner.query(`DROP INDEX "IDX_4e171c0f4e2b274666de9daeba"`);
    await queryRunner.query(`DROP INDEX "IDX_11b97895c6e9f5162c38604b33"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_groups_resource_group" ("resourceId" integer NOT NULL, "resourceGroupId" integer NOT NULL, CONSTRAINT "FK_11b97895c6e9f5162c38604b331" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE, PRIMARY KEY ("resourceId", "resourceGroupId"))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_groups_resource_group"("resourceId", "resourceGroupId") SELECT "resourceId", "resourceGroupId" FROM "resource_groups_resource_group"`
    );
    await queryRunner.query(`DROP TABLE "resource_groups_resource_group"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_resource_groups_resource_group" RENAME TO "resource_groups_resource_group"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4e171c0f4e2b274666de9daeba" ON "resource_groups_resource_group" ("resourceGroupId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_11b97895c6e9f5162c38604b33" ON "resource_groups_resource_group" ("resourceId") `
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_resource" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "description" text, "imageFilename" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "documentationType" text, "documentationMarkdown" text, "documentationUrl" text, "allowTakeOver" boolean NOT NULL DEFAULT (0))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource"("id", "name", "description", "imageFilename", "createdAt", "updatedAt", "documentationType", "documentationMarkdown", "documentationUrl", "allowTakeOver") SELECT "id", "name", "description", "imageFilename", "createdAt", "updatedAt", "documentationType", "documentationMarkdown", "documentationUrl", "allowTakeOver" FROM "resource"`
    );
    await queryRunner.query(`DROP TABLE "resource"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource" RENAME TO "resource"`);
    await queryRunner.query(`CREATE TABLE "temporary_resource_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer, "startTime" datetime NOT NULL DEFAULT (datetime('now')), "startNotes" text, "endTime" datetime, "endNotes" text, "usageInMinutes" integer NOT NULL AS (CASE 
      WHEN "endTime" IS NULL THEN -1
      ELSE (julianday("endTime") - julianday("startTime")) * 1440
    END) STORED, CONSTRAINT "FK_6f80e3fc0cf8bfce60e25a6805f" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_8177b2b424a6d31c533d57b95cc" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
    await queryRunner.query(
      `INSERT INTO "temporary_resource_usage"("id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes") SELECT "id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes" FROM "resource_usage"`
    );
    await queryRunner.query(`DROP TABLE "resource_usage"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_usage" RENAME TO "resource_usage"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_introduction_user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer NOT NULL, "grantedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceGroupId" integer, CONSTRAINT "FK_c2d6d85b029dbc3a18432ac0475" FOREIGN KEY ("resourceGroupId") REFERENCES "resource_group" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_12a2193fc2a76b7cbc8fcb1aef8" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_1965529b5359163f498e97b6979" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_introduction_user"("id", "resourceId", "userId", "grantedAt", "resourceGroupId") SELECT "id", "resourceId", "userId", "grantedAt", "resourceGroupId" FROM "resource_introduction_user"`
    );
    await queryRunner.query(`DROP TABLE "resource_introduction_user"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_resource_introduction_user" RENAME TO "resource_introduction_user"`
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_mqtt_resource_config" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "serverId" integer NOT NULL, "inUseTopic" text NOT NULL, "inUseMessage" text NOT NULL, "notInUseTopic" text NOT NULL, "notInUseMessage" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "name" text NOT NULL, CONSTRAINT "FK_6ea7fa73bd2eb020ae6fc7206a3" FOREIGN KEY ("serverId") REFERENCES "mqtt_server" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_df86aa26ad244673076a0ffc833" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_mqtt_resource_config"("id", "resourceId", "serverId", "inUseTopic", "inUseMessage", "notInUseTopic", "notInUseMessage", "createdAt", "updatedAt", "name") SELECT "id", "resourceId", "serverId", "inUseTopic", "inUseMessage", "notInUseTopic", "notInUseMessage", "createdAt", "updatedAt", "name" FROM "mqtt_resource_config"`
    );
    await queryRunner.query(`DROP TABLE "mqtt_resource_config"`);
    await queryRunner.query(`ALTER TABLE "temporary_mqtt_resource_config" RENAME TO "mqtt_resource_config"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_webhook_config" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "name" text NOT NULL, "url" text NOT NULL, "method" text NOT NULL, "headers" text, "inUseTemplate" text NOT NULL, "notInUseTemplate" text NOT NULL, "active" boolean NOT NULL DEFAULT (1), "retryEnabled" boolean NOT NULL DEFAULT (0), "maxRetries" integer NOT NULL DEFAULT (3), "retryDelay" integer NOT NULL DEFAULT (1000), "secret" text, "signatureHeader" text NOT NULL DEFAULT ('X-Webhook-Signature'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_2ff18641734c27268d49ac3fdd0" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_webhook_config"("id", "resourceId", "name", "url", "method", "headers", "inUseTemplate", "notInUseTemplate", "active", "retryEnabled", "maxRetries", "retryDelay", "secret", "signatureHeader", "createdAt", "updatedAt") SELECT "id", "resourceId", "name", "url", "method", "headers", "inUseTemplate", "notInUseTemplate", "active", "retryEnabled", "maxRetries", "retryDelay", "secret", "signatureHeader", "createdAt", "updatedAt" FROM "webhook_config"`
    );
    await queryRunner.query(`DROP TABLE "webhook_config"`);
    await queryRunner.query(`ALTER TABLE "temporary_webhook_config" RENAME TO "webhook_config"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_introduction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "receiverUserId" integer NOT NULL, "tutorUserId" integer, "completedAt" datetime NOT NULL DEFAULT (datetime('now')), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceGroupId" integer, CONSTRAINT "FK_c99fa831a952f9954fa435705ba" FOREIGN KEY ("resourceGroupId") REFERENCES "resource_group" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_bef5cdb0c4699414e813acfb683" FOREIGN KEY ("tutorUserId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_275626e28c839888d63e6a7d2c1" FOREIGN KEY ("receiverUserId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_1693bbfb15013a1ec119e9f9c0d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_introduction"("id", "resourceId", "receiverUserId", "tutorUserId", "completedAt", "createdAt", "resourceGroupId") SELECT "id", "resourceId", "receiverUserId", "tutorUserId", "completedAt", "createdAt", "resourceGroupId" FROM "resource_introduction"`
    );
    await queryRunner.query(`DROP TABLE "resource_introduction"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_introduction" RENAME TO "resource_introduction"`);
    await queryRunner.query(`DROP INDEX "IDX_4e171c0f4e2b274666de9daeba"`);
    await queryRunner.query(`DROP INDEX "IDX_11b97895c6e9f5162c38604b33"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_groups_resource_group" ("resourceId" integer NOT NULL, "resourceGroupId" integer NOT NULL, CONSTRAINT "FK_11b97895c6e9f5162c38604b331" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "FK_4e171c0f4e2b274666de9daeba6" FOREIGN KEY ("resourceGroupId") REFERENCES "resource_group" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, PRIMARY KEY ("resourceId", "resourceGroupId"))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_groups_resource_group"("resourceId", "resourceGroupId") SELECT "resourceId", "resourceGroupId" FROM "resource_groups_resource_group"`
    );
    await queryRunner.query(`DROP TABLE "resource_groups_resource_group"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_resource_groups_resource_group" RENAME TO "resource_groups_resource_group"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4e171c0f4e2b274666de9daeba" ON "resource_groups_resource_group" ("resourceGroupId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_11b97895c6e9f5162c38604b33" ON "resource_groups_resource_group" ("resourceId") `
    );

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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "typeorm_metadata" WHERE "type" = ? AND "name" = ?`, [
      'VIEW',
      'resource_computed_view',
    ]);
    await queryRunner.query(`DROP VIEW "resource_computed_view"`);

    await queryRunner.query(`DROP INDEX "IDX_11b97895c6e9f5162c38604b33"`);
    await queryRunner.query(`DROP INDEX "IDX_4e171c0f4e2b274666de9daeba"`);
    await queryRunner.query(
      `ALTER TABLE "resource_groups_resource_group" RENAME TO "temporary_resource_groups_resource_group"`
    );
    await queryRunner.query(
      `CREATE TABLE "resource_groups_resource_group" ("resourceId" integer NOT NULL, "resourceGroupId" integer NOT NULL, CONSTRAINT "FK_11b97895c6e9f5162c38604b331" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE, PRIMARY KEY ("resourceId", "resourceGroupId"))`
    );
    await queryRunner.query(
      `INSERT INTO "resource_groups_resource_group"("resourceId", "resourceGroupId") SELECT "resourceId", "resourceGroupId" FROM "temporary_resource_groups_resource_group"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_groups_resource_group"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_11b97895c6e9f5162c38604b33" ON "resource_groups_resource_group" ("resourceId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4e171c0f4e2b274666de9daeba" ON "resource_groups_resource_group" ("resourceGroupId") `
    );
    await queryRunner.query(`ALTER TABLE "resource_introduction" RENAME TO "temporary_resource_introduction"`);
    await queryRunner.query(
      `CREATE TABLE "resource_introduction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "receiverUserId" integer NOT NULL, "tutorUserId" integer, "completedAt" datetime NOT NULL DEFAULT (datetime('now')), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceGroupId" integer, CONSTRAINT "FK_c99fa831a952f9954fa435705ba" FOREIGN KEY ("resourceGroupId") REFERENCES "resource_group" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_bef5cdb0c4699414e813acfb683" FOREIGN KEY ("tutorUserId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_275626e28c839888d63e6a7d2c1" FOREIGN KEY ("receiverUserId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "resource_introduction"("id", "resourceId", "receiverUserId", "tutorUserId", "completedAt", "createdAt", "resourceGroupId") SELECT "id", "resourceId", "receiverUserId", "tutorUserId", "completedAt", "createdAt", "resourceGroupId" FROM "temporary_resource_introduction"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_introduction"`);
    await queryRunner.query(`ALTER TABLE "webhook_config" RENAME TO "temporary_webhook_config"`);
    await queryRunner.query(
      `CREATE TABLE "webhook_config" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "name" text NOT NULL, "url" text NOT NULL, "method" text NOT NULL, "headers" text, "inUseTemplate" text NOT NULL, "notInUseTemplate" text NOT NULL, "active" boolean NOT NULL DEFAULT (1), "retryEnabled" boolean NOT NULL DEFAULT (0), "maxRetries" integer NOT NULL DEFAULT (3), "retryDelay" integer NOT NULL DEFAULT (1000), "secret" text, "signatureHeader" text NOT NULL DEFAULT ('X-Webhook-Signature'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
    await queryRunner.query(
      `INSERT INTO "webhook_config"("id", "resourceId", "name", "url", "method", "headers", "inUseTemplate", "notInUseTemplate", "active", "retryEnabled", "maxRetries", "retryDelay", "secret", "signatureHeader", "createdAt", "updatedAt") SELECT "id", "resourceId", "name", "url", "method", "headers", "inUseTemplate", "notInUseTemplate", "active", "retryEnabled", "maxRetries", "retryDelay", "secret", "signatureHeader", "createdAt", "updatedAt" FROM "temporary_webhook_config"`
    );
    await queryRunner.query(`DROP TABLE "temporary_webhook_config"`);
    await queryRunner.query(`ALTER TABLE "mqtt_resource_config" RENAME TO "temporary_mqtt_resource_config"`);
    await queryRunner.query(
      `CREATE TABLE "mqtt_resource_config" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "serverId" integer NOT NULL, "inUseTopic" text NOT NULL, "inUseMessage" text NOT NULL, "notInUseTopic" text NOT NULL, "notInUseMessage" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "name" text NOT NULL, CONSTRAINT "FK_6ea7fa73bd2eb020ae6fc7206a3" FOREIGN KEY ("serverId") REFERENCES "mqtt_server" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "mqtt_resource_config"("id", "resourceId", "serverId", "inUseTopic", "inUseMessage", "notInUseTopic", "notInUseMessage", "createdAt", "updatedAt", "name") SELECT "id", "resourceId", "serverId", "inUseTopic", "inUseMessage", "notInUseTopic", "notInUseMessage", "createdAt", "updatedAt", "name" FROM "temporary_mqtt_resource_config"`
    );
    await queryRunner.query(`DROP TABLE "temporary_mqtt_resource_config"`);
    await queryRunner.query(
      `ALTER TABLE "resource_introduction_user" RENAME TO "temporary_resource_introduction_user"`
    );
    await queryRunner.query(
      `CREATE TABLE "resource_introduction_user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer NOT NULL, "grantedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceGroupId" integer, CONSTRAINT "FK_c2d6d85b029dbc3a18432ac0475" FOREIGN KEY ("resourceGroupId") REFERENCES "resource_group" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_12a2193fc2a76b7cbc8fcb1aef8" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "resource_introduction_user"("id", "resourceId", "userId", "grantedAt", "resourceGroupId") SELECT "id", "resourceId", "userId", "grantedAt", "resourceGroupId" FROM "temporary_resource_introduction_user"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_introduction_user"`);
    await queryRunner.query(`ALTER TABLE "resource_usage" RENAME TO "temporary_resource_usage"`);
    await queryRunner.query(`CREATE TABLE "resource_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer, "startTime" datetime NOT NULL DEFAULT (datetime('now')), "startNotes" text, "endTime" datetime, "endNotes" text, "usageInMinutes" integer NOT NULL AS (CASE 
      WHEN "endTime" IS NULL THEN -1
      ELSE (julianday("endTime") - julianday("startTime")) * 1440
    END) STORED, CONSTRAINT "FK_6f80e3fc0cf8bfce60e25a6805f" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
    await queryRunner.query(
      `INSERT INTO "resource_usage"("id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes") SELECT "id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes" FROM "temporary_resource_usage"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_usage"`);
    await queryRunner.query(`ALTER TABLE "resource" RENAME TO "temporary_resource"`);
    await queryRunner.query(
      `CREATE TABLE "resource" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "description" text, "imageFilename" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "documentationType" text, "documentationMarkdown" text, "documentationUrl" text, "allowTakeOver" boolean NOT NULL DEFAULT (false))`
    );
    await queryRunner.query(
      `INSERT INTO "resource"("id", "name", "description", "imageFilename", "createdAt", "updatedAt", "documentationType", "documentationMarkdown", "documentationUrl", "allowTakeOver") SELECT "id", "name", "description", "imageFilename", "createdAt", "updatedAt", "documentationType", "documentationMarkdown", "documentationUrl", "allowTakeOver" FROM "temporary_resource"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource"`);
    await queryRunner.query(`DROP INDEX "IDX_11b97895c6e9f5162c38604b33"`);
    await queryRunner.query(`DROP INDEX "IDX_4e171c0f4e2b274666de9daeba"`);
    await queryRunner.query(
      `ALTER TABLE "resource_groups_resource_group" RENAME TO "temporary_resource_groups_resource_group"`
    );
    await queryRunner.query(
      `CREATE TABLE "resource_groups_resource_group" ("resourceId" integer NOT NULL, "resourceGroupId" integer NOT NULL, CONSTRAINT "FK_4e171c0f4e2b274666de9daeba6" FOREIGN KEY ("resourceGroupId") REFERENCES "resource_group" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_11b97895c6e9f5162c38604b331" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE, PRIMARY KEY ("resourceId", "resourceGroupId"))`
    );
    await queryRunner.query(
      `INSERT INTO "resource_groups_resource_group"("resourceId", "resourceGroupId") SELECT "resourceId", "resourceGroupId" FROM "temporary_resource_groups_resource_group"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_groups_resource_group"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_11b97895c6e9f5162c38604b33" ON "resource_groups_resource_group" ("resourceId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4e171c0f4e2b274666de9daeba" ON "resource_groups_resource_group" ("resourceGroupId") `
    );
    await queryRunner.query(`ALTER TABLE "resource_introduction" RENAME TO "temporary_resource_introduction"`);
    await queryRunner.query(
      `CREATE TABLE "resource_introduction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "receiverUserId" integer NOT NULL, "tutorUserId" integer, "completedAt" datetime NOT NULL DEFAULT (datetime('now')), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceGroupId" integer, CONSTRAINT "FK_c99fa831a952f9954fa435705ba" FOREIGN KEY ("resourceGroupId") REFERENCES "resource_group" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_bef5cdb0c4699414e813acfb683" FOREIGN KEY ("tutorUserId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_275626e28c839888d63e6a7d2c1" FOREIGN KEY ("receiverUserId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_1693bbfb15013a1ec119e9f9c0d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "resource_introduction"("id", "resourceId", "receiverUserId", "tutorUserId", "completedAt", "createdAt", "resourceGroupId") SELECT "id", "resourceId", "receiverUserId", "tutorUserId", "completedAt", "createdAt", "resourceGroupId" FROM "temporary_resource_introduction"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_introduction"`);
    await queryRunner.query(`ALTER TABLE "webhook_config" RENAME TO "temporary_webhook_config"`);
    await queryRunner.query(
      `CREATE TABLE "webhook_config" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "name" text NOT NULL, "url" text NOT NULL, "method" text NOT NULL, "headers" text, "inUseTemplate" text NOT NULL, "notInUseTemplate" text NOT NULL, "active" boolean NOT NULL DEFAULT (1), "retryEnabled" boolean NOT NULL DEFAULT (0), "maxRetries" integer NOT NULL DEFAULT (3), "retryDelay" integer NOT NULL DEFAULT (1000), "secret" text, "signatureHeader" text NOT NULL DEFAULT ('X-Webhook-Signature'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_2ff18641734c27268d49ac3fdd0" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "webhook_config"("id", "resourceId", "name", "url", "method", "headers", "inUseTemplate", "notInUseTemplate", "active", "retryEnabled", "maxRetries", "retryDelay", "secret", "signatureHeader", "createdAt", "updatedAt") SELECT "id", "resourceId", "name", "url", "method", "headers", "inUseTemplate", "notInUseTemplate", "active", "retryEnabled", "maxRetries", "retryDelay", "secret", "signatureHeader", "createdAt", "updatedAt" FROM "temporary_webhook_config"`
    );
    await queryRunner.query(`DROP TABLE "temporary_webhook_config"`);
    await queryRunner.query(`ALTER TABLE "mqtt_resource_config" RENAME TO "temporary_mqtt_resource_config"`);
    await queryRunner.query(
      `CREATE TABLE "mqtt_resource_config" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "serverId" integer NOT NULL, "inUseTopic" text NOT NULL, "inUseMessage" text NOT NULL, "notInUseTopic" text NOT NULL, "notInUseMessage" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "name" text NOT NULL, CONSTRAINT "FK_6ea7fa73bd2eb020ae6fc7206a3" FOREIGN KEY ("serverId") REFERENCES "mqtt_server" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_df86aa26ad244673076a0ffc833" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "mqtt_resource_config"("id", "resourceId", "serverId", "inUseTopic", "inUseMessage", "notInUseTopic", "notInUseMessage", "createdAt", "updatedAt", "name") SELECT "id", "resourceId", "serverId", "inUseTopic", "inUseMessage", "notInUseTopic", "notInUseMessage", "createdAt", "updatedAt", "name" FROM "temporary_mqtt_resource_config"`
    );
    await queryRunner.query(`DROP TABLE "temporary_mqtt_resource_config"`);
    await queryRunner.query(
      `ALTER TABLE "resource_introduction_user" RENAME TO "temporary_resource_introduction_user"`
    );
    await queryRunner.query(
      `CREATE TABLE "resource_introduction_user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer NOT NULL, "grantedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceGroupId" integer, CONSTRAINT "FK_c2d6d85b029dbc3a18432ac0475" FOREIGN KEY ("resourceGroupId") REFERENCES "resource_group" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_1965529b5359163f498e97b6979" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_12a2193fc2a76b7cbc8fcb1aef8" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "resource_introduction_user"("id", "resourceId", "userId", "grantedAt", "resourceGroupId") SELECT "id", "resourceId", "userId", "grantedAt", "resourceGroupId" FROM "temporary_resource_introduction_user"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_introduction_user"`);
    await queryRunner.query(`ALTER TABLE "resource_usage" RENAME TO "temporary_resource_usage"`);
    await queryRunner.query(`CREATE TABLE "resource_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer, "startTime" datetime NOT NULL DEFAULT (datetime('now')), "startNotes" text, "endTime" datetime, "endNotes" text, "usageInMinutes" integer NOT NULL AS (CASE 
      WHEN "endTime" IS NULL THEN -1
      ELSE (julianday("endTime") - julianday("startTime")) * 1440
    END) STORED, CONSTRAINT "FK_6f80e3fc0cf8bfce60e25a6805f" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_8177b2b424a6d31c533d57b95cc" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
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
