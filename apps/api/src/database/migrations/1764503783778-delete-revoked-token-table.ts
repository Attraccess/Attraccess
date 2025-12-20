import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeleteRevokedTokenTable1764503783778 implements MigrationInterface {
  name = 'DeleteRevokedTokenTable1764503783778';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "revoked_token"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "revoked_token" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tokenId" text NOT NULL, "revokedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
  }
}
