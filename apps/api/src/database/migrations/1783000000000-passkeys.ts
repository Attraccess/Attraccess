import { MigrationInterface, QueryRunner } from 'typeorm';

export class Passkeys1783000000000 implements MigrationInterface {
  name = 'Passkeys1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "passkey" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL,
        "credentialId" text NOT NULL,
        "publicKey" text NOT NULL,
        "counter" integer NOT NULL DEFAULT (0),
        "transports" text,
        "name" text NOT NULL,
        "backedUp" boolean NOT NULL DEFAULT (0),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "lastUsedAt" datetime,
        CONSTRAINT "UQ_passkey_credential_id" UNIQUE ("credentialId"),
        CONSTRAINT "FK_passkey_user" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_passkey_user" ON "passkey" ("userId")`);

    await queryRunner.query(
      `CREATE TABLE "passkey_challenge" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "challenge" text NOT NULL,
        "userId" integer,
        "expiresAt" datetime NOT NULL,
        CONSTRAINT "UQ_passkey_challenge_challenge" UNIQUE ("challenge")
      )`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_passkey_challenge_expires_at" ON "passkey_challenge" ("expiresAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_passkey_challenge_expires_at"`);
    await queryRunner.query(`DROP TABLE "passkey_challenge"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_passkey_user"`);
    await queryRunner.query(`DROP TABLE "passkey"`);
  }
}
