import { MigrationInterface, QueryRunner } from 'typeorm';

export class McpOauth1793200000000 implements MigrationInterface {
  name = 'McpOauth1793200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "mcp_oauth_client" (
        "clientId" text PRIMARY KEY NOT NULL,
        "clientName" text NOT NULL,
        "redirectUris" text NOT NULL,
        "registeredIp" text,
        "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "mcp_oauth_grant" (
        "id" text PRIMARY KEY NOT NULL,
        "userId" integer NOT NULL,
        "clientId" text NOT NULL,
        "permissionKeys" text NOT NULL,
        "resource" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        "expiresAt" datetime NOT NULL,
        "lastUsedAt" datetime,
        "revokedAt" datetime,
        CONSTRAINT "FK_mcp_oauth_grant_user" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_mcp_oauth_grant_user" ON "mcp_oauth_grant" ("userId")`);
    await queryRunner.query(
      `CREATE TABLE "mcp_oauth_token" (
        "tokenHash" text PRIMARY KEY NOT NULL,
        "kind" text NOT NULL,
        "grantId" text,
        "payload" text,
        "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        "expiresAt" datetime NOT NULL,
        "usedAt" datetime,
        CONSTRAINT "FK_mcp_oauth_token_grant" FOREIGN KEY ("grantId") REFERENCES "mcp_oauth_grant" ("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_mcp_oauth_token_grant" ON "mcp_oauth_token" ("grantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_mcp_oauth_token_expires" ON "mcp_oauth_token" ("expiresAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mcp_oauth_token_expires"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mcp_oauth_token_grant"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mcp_oauth_token"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mcp_oauth_grant_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mcp_oauth_grant"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mcp_oauth_client"`);
  }
}
