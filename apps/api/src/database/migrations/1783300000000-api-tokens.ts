import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApiTokens1783300000000 implements MigrationInterface {
  name = 'ApiTokens1783300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "isDisabled" boolean NOT NULL DEFAULT (0)`);
    await queryRunner.query(
      `CREATE TABLE "api_token" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL,
        "name" text NOT NULL,
        "tokenHash" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        "lastUsedAt" datetime,
        "expiresAt" datetime,
        "revokedAt" datetime,
        CONSTRAINT "FK_api_token_user" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_api_token_hash" ON "api_token" ("tokenHash")`);
    await queryRunner.query(`CREATE INDEX "IDX_api_token_user" ON "api_token" ("userId")`);
    await queryRunner.query(
      `CREATE TABLE "api_token_permission" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "apiTokenId" integer NOT NULL,
        "permissionKey" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        CONSTRAINT "FK_api_token_permission_token" FOREIGN KEY ("apiTokenId") REFERENCES "api_token" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_api_token_permission_permission" FOREIGN KEY ("permissionKey") REFERENCES "permission" ("key") ON DELETE CASCADE,
        CONSTRAINT "UQ_api_token_permission" UNIQUE ("apiTokenId", "permissionKey")
      )`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_api_token_permission_token" ON "api_token_permission" ("apiTokenId")`);
    await queryRunner.query(`CREATE INDEX "IDX_api_token_permission_permission" ON "api_token_permission" ("permissionKey")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_api_token_permission_permission"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_api_token_permission_token"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "api_token_permission"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_api_token_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_api_token_hash"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "api_token"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "isDisabled"`);
  }
}
