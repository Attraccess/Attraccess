import { MigrationInterface, QueryRunner } from 'typeorm';

export class MqttQosRetainSettingPerFlowNode1761910926026 implements MigrationInterface {
  name = 'MqttQosRetainSettingPerFlowNode1761910926026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_mqtt_server" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "host" text NOT NULL, "port" integer NOT NULL, "username" text, "password" text, "clientId" text, "useTls" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "defaultPublishQos" integer NOT NULL DEFAULT (0), "defaultPublishRetain" boolean NOT NULL DEFAULT (0), "defaultSubscribeQos" integer NOT NULL DEFAULT (0))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_mqtt_server"("id", "name", "host", "port", "username", "password", "clientId", "useTls", "createdAt", "updatedAt") SELECT "id", "name", "host", "port", "username", "password", "clientId", "useTls", "createdAt", "updatedAt" FROM "mqtt_server"`,
    );
    await queryRunner.query(`DROP TABLE "mqtt_server"`);
    await queryRunner.query(`ALTER TABLE "temporary_mqtt_server" RENAME TO "mqtt_server"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_sso_provider_oidc_configuration" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ssoProviderId" integer NOT NULL, "issuer" text NOT NULL, "authorizationURL" text NOT NULL, "tokenURL" text NOT NULL, "userInfoURL" text NOT NULL, "clientId" text NOT NULL, "clientSecret" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "scopes" text, "usernameClaimPaths" text, "emailClaimPaths" text, CONSTRAINT "REL_e0afa5fbb3a37c919d37d5438a" UNIQUE ("ssoProviderId"), CONSTRAINT "FK_e0afa5fbb3a37c919d37d5438ab" FOREIGN KEY ("ssoProviderId") REFERENCES "sso_provider" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_sso_provider_oidc_configuration"("id", "ssoProviderId", "issuer", "authorizationURL", "tokenURL", "userInfoURL", "clientId", "clientSecret", "createdAt", "updatedAt", "scopes", "usernameClaimPaths", "emailClaimPaths") SELECT "id", "ssoProviderId", "issuer", "authorizationURL", "tokenURL", "userInfoURL", "clientId", "clientSecret", "createdAt", "updatedAt", "scopes", "usernameClaimPaths", "emailClaimPaths" FROM "sso_provider_oidc_configuration"`,
    );
    await queryRunner.query(`DROP TABLE "sso_provider_oidc_configuration"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_sso_provider_oidc_configuration" RENAME TO "sso_provider_oidc_configuration"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sso_provider_oidc_configuration" RENAME TO "temporary_sso_provider_oidc_configuration"`,
    );
    await queryRunner.query(
      `CREATE TABLE "sso_provider_oidc_configuration" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ssoProviderId" integer NOT NULL, "issuer" text NOT NULL, "authorizationURL" text NOT NULL, "tokenURL" text NOT NULL, "userInfoURL" text NOT NULL, "clientId" text NOT NULL, "clientSecret" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "scopes" varchar, "usernameClaimPaths" varchar, "emailClaimPaths" varchar, CONSTRAINT "REL_e0afa5fbb3a37c919d37d5438a" UNIQUE ("ssoProviderId"), CONSTRAINT "FK_e0afa5fbb3a37c919d37d5438ab" FOREIGN KEY ("ssoProviderId") REFERENCES "sso_provider" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "sso_provider_oidc_configuration"("id", "ssoProviderId", "issuer", "authorizationURL", "tokenURL", "userInfoURL", "clientId", "clientSecret", "createdAt", "updatedAt", "scopes", "usernameClaimPaths", "emailClaimPaths") SELECT "id", "ssoProviderId", "issuer", "authorizationURL", "tokenURL", "userInfoURL", "clientId", "clientSecret", "createdAt", "updatedAt", "scopes", "usernameClaimPaths", "emailClaimPaths" FROM "temporary_sso_provider_oidc_configuration"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_sso_provider_oidc_configuration"`);
    await queryRunner.query(`ALTER TABLE "mqtt_server" RENAME TO "temporary_mqtt_server"`);
    await queryRunner.query(
      `CREATE TABLE "mqtt_server" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "host" text NOT NULL, "port" integer NOT NULL, "username" text, "password" text, "clientId" text, "useTls" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "mqtt_server"("id", "name", "host", "port", "username", "password", "clientId", "useTls", "createdAt", "updatedAt") SELECT "id", "name", "host", "port", "username", "password", "clientId", "useTls", "createdAt", "updatedAt" FROM "temporary_mqtt_server"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_mqtt_server"`);
  }
}
