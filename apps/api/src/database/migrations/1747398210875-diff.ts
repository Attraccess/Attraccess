import { MigrationInterface, QueryRunner } from 'typeorm';

export class Diff1747398210875 implements MigrationInterface {
  name = 'Diff1747398210875';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "typeorm_metadata" WHERE "type" = ? AND "name" = ?`, [
      'VIEW',
      'resource_computed_view',
    ]);
    await queryRunner.query(`DROP VIEW "resource_computed_view"`);

    await queryRunner.query(
      `CREATE TABLE "temporary_resource_group" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "description" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_group"("id", "name", "description", "createdAt", "updatedAt") SELECT "id", "name", "description", "createdAt", "updatedAt" FROM "resource_group"`
    );
    await queryRunner.query(`DROP TABLE "resource_group"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_group" RENAME TO "resource_group"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "description" text, "imageFilename" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource"("id", "name", "description", "imageFilename", "createdAt", "updatedAt") SELECT "id", "name", "description", "imageFilename", "createdAt", "updatedAt" FROM "resource"`
    );
    await queryRunner.query(`DROP TABLE "resource"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource" RENAME TO "resource"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_authentication_detail" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "type" varchar CHECK( "type" IN ('local_password','sso') ) NOT NULL, "password" varchar, CONSTRAINT "FK_65a0cb4c981b2ebe57d4c546fda" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_authentication_detail"("id", "userId", "type", "password") SELECT "id", "userId", "type", "password" FROM "authentication_detail"`
    );
    await queryRunner.query(`DROP TABLE "authentication_detail"`);
    await queryRunner.query(`ALTER TABLE "temporary_authentication_detail" RENAME TO "authentication_detail"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_sso_provider" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "type" varchar CHECK( "type" IN ('OIDC') ) NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_sso_provider"("id", "name", "type", "createdAt", "updatedAt") SELECT "id", "name", "type", "createdAt", "updatedAt" FROM "sso_provider"`
    );
    await queryRunner.query(`DROP TABLE "sso_provider"`);
    await queryRunner.query(`ALTER TABLE "temporary_sso_provider" RENAME TO "sso_provider"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_group" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "description" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_group"("id", "name", "description", "createdAt", "updatedAt") SELECT "id", "name", "description", "createdAt", "updatedAt" FROM "resource_group"`
    );
    await queryRunner.query(`DROP TABLE "resource_group"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_group" RENAME TO "resource_group"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_mqtt_server" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "host" text NOT NULL, "port" integer NOT NULL, "username" text, "password" text, "clientId" text, "useTls" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_mqtt_server"("id", "name", "host", "port", "username", "password", "clientId", "useTls", "createdAt", "updatedAt") SELECT "id", "name", "host", "port", "username", "password", "clientId", "useTls", "createdAt", "updatedAt" FROM "mqtt_server"`
    );
    await queryRunner.query(`DROP TABLE "mqtt_server"`);
    await queryRunner.query(`ALTER TABLE "temporary_mqtt_server" RENAME TO "mqtt_server"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_mqtt_resource_config" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "serverId" integer NOT NULL, "inUseTopic" text NOT NULL, "inUseMessage" text NOT NULL, "notInUseTopic" text NOT NULL, "notInUseMessage" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_6ea7fa73bd2eb020ae6fc7206a3" FOREIGN KEY ("serverId") REFERENCES "mqtt_server" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_df86aa26ad244673076a0ffc833" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_mqtt_resource_config"("id", "resourceId", "serverId", "inUseTopic", "inUseMessage", "notInUseTopic", "notInUseMessage", "createdAt", "updatedAt") SELECT "id", "resourceId", "serverId", "inUseTopic", "inUseMessage", "notInUseTopic", "notInUseMessage", "createdAt", "updatedAt" FROM "mqtt_resource_config"`
    );
    await queryRunner.query(`DROP TABLE "mqtt_resource_config"`);
    await queryRunner.query(`ALTER TABLE "temporary_mqtt_resource_config" RENAME TO "mqtt_resource_config"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_webhook_config" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "name" text NOT NULL, "url" text NOT NULL, "method" text NOT NULL, "headers" text, "inUseTemplate" text NOT NULL, "notInUseTemplate" text NOT NULL, "active" boolean NOT NULL DEFAULT (1), "retryEnabled" boolean NOT NULL DEFAULT (0), "maxRetries" integer NOT NULL DEFAULT (3), "retryDelay" integer NOT NULL DEFAULT (1000), "secret" text, "signatureHeader" text NOT NULL DEFAULT ('X-Webhook-Signature'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_2ff18641734c27268d49ac3fdd0" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_webhook_config"("id", "resourceId", "name", "url", "method", "headers", "inUseTemplate", "notInUseTemplate", "active", "retryEnabled", "maxRetries", "retryDelay", "secret", "signatureHeader", "createdAt", "updatedAt") SELECT "id", "resourceId", "name", "url", "method", "headers", "inUseTemplate", "notInUseTemplate", "active", "retryEnabled", "maxRetries", "retryDelay", "secret", "signatureHeader", "createdAt", "updatedAt" FROM "webhook_config"`
    );
    await queryRunner.query(`DROP TABLE "webhook_config"`);
    await queryRunner.query(`ALTER TABLE "temporary_webhook_config" RENAME TO "webhook_config"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "description" text, "imageFilename" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource"("id", "name", "description", "imageFilename", "createdAt", "updatedAt") SELECT "id", "name", "description", "imageFilename", "createdAt", "updatedAt" FROM "resource"`
    );
    await queryRunner.query(`DROP TABLE "resource"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource" RENAME TO "resource"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_revoked_token" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "token" text NOT NULL, "tokenId" text NOT NULL, "expiresAt" datetime NOT NULL, "revokedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_9441609ff7307fb73d22eed453d" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_revoked_token"("id", "userId", "token", "tokenId", "expiresAt", "revokedAt") SELECT "id", "userId", "token", "tokenId", "expiresAt", "revokedAt" FROM "revoked_token"`
    );
    await queryRunner.query(`DROP TABLE "revoked_token"`);
    await queryRunner.query(`ALTER TABLE "temporary_revoked_token" RENAME TO "revoked_token"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "username" text NOT NULL, "email" text NOT NULL, "isEmailVerified" boolean NOT NULL DEFAULT (0), "emailVerificationToken" text, "emailVerificationTokenExpiresAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "canManageResources" boolean NOT NULL DEFAULT (0), "canManageSystemConfiguration" boolean NOT NULL DEFAULT (0), "canManageUsers" boolean NOT NULL DEFAULT (0), CONSTRAINT "UQ_78a916df40e02a9deb1c4b75edb" UNIQUE ("username"), CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_user"("id", "username", "email", "isEmailVerified", "emailVerificationToken", "emailVerificationTokenExpiresAt", "createdAt", "updatedAt", "canManageResources", "canManageSystemConfiguration", "canManageUsers") SELECT "id", "username", "email", "isEmailVerified", "emailVerificationToken", "emailVerificationTokenExpiresAt", "createdAt", "updatedAt", "canManageResources", "canManageSystemConfiguration", "canManageUsers" FROM "user"`
    );
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`ALTER TABLE "temporary_user" RENAME TO "user"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_authentication_detail" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "type" varchar CHECK( "type" IN ('local_password','sso') ) NOT NULL, "password" text, CONSTRAINT "FK_65a0cb4c981b2ebe57d4c546fda" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_authentication_detail"("id", "userId", "type", "password") SELECT "id", "userId", "type", "password" FROM "authentication_detail"`
    );
    await queryRunner.query(`DROP TABLE "authentication_detail"`);
    await queryRunner.query(`ALTER TABLE "temporary_authentication_detail" RENAME TO "authentication_detail"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_sso_provider_oidc_configuration" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ssoProviderId" integer NOT NULL, "issuer" text NOT NULL, "authorizationURL" text NOT NULL, "tokenURL" text NOT NULL, "userInfoURL" text NOT NULL, "clientId" text NOT NULL, "clientSecret" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "REL_e0afa5fbb3a37c919d37d5438a" UNIQUE ("ssoProviderId"), CONSTRAINT "FK_e0afa5fbb3a37c919d37d5438ab" FOREIGN KEY ("ssoProviderId") REFERENCES "sso_provider" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_sso_provider_oidc_configuration"("id", "ssoProviderId", "issuer", "authorizationURL", "tokenURL", "userInfoURL", "clientId", "clientSecret", "createdAt", "updatedAt") SELECT "id", "ssoProviderId", "issuer", "authorizationURL", "tokenURL", "userInfoURL", "clientId", "clientSecret", "createdAt", "updatedAt" FROM "sso_provider_oidc_configuration"`
    );
    await queryRunner.query(`DROP TABLE "sso_provider_oidc_configuration"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_sso_provider_oidc_configuration" RENAME TO "sso_provider_oidc_configuration"`
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_sso_provider" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "type" varchar CHECK( "type" IN ('OIDC') ) NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_sso_provider"("id", "name", "type", "createdAt", "updatedAt") SELECT "id", "name", "type", "createdAt", "updatedAt" FROM "sso_provider"`
    );
    await queryRunner.query(`DROP TABLE "sso_provider"`);
    await queryRunner.query(`ALTER TABLE "temporary_sso_provider" RENAME TO "sso_provider"`);

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
    await queryRunner.query(`DROP VIEW IF EXISTS "resource_computed_view"`);

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
