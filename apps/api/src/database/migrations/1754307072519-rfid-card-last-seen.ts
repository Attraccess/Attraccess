import { MigrationInterface, QueryRunner } from 'typeorm';

export class NfcCardLastSeen1754307072519 implements MigrationInterface {
  name = 'NfcCardLastSeen1754307072519';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_nfc_card" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "uid" text NOT NULL, "userId" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "key_0" text NOT NULL DEFAULT ('0000000000000000'), "lastSeen" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), CONSTRAINT "FK_6fab76f70c8b8bd902e6e4e115e" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_nfc_card"("id", "uid", "userId", "createdAt", "updatedAt", "key_0") SELECT "id", "uid", "userId", "createdAt", "updatedAt", "key_0" FROM "nfc_card"`
    );
    await queryRunner.query(`DROP TABLE "nfc_card"`);
    await queryRunner.query(`ALTER TABLE "temporary_nfc_card" RENAME TO "nfc_card"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "nfc_card" RENAME TO "temporary_nfc_card"`);
    await queryRunner.query(
      `CREATE TABLE "nfc_card" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "uid" text NOT NULL, "userId" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "key_0" text NOT NULL DEFAULT ('0000000000000000'), CONSTRAINT "FK_6fab76f70c8b8bd902e6e4e115e" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "nfc_card"("id", "uid", "userId", "createdAt", "updatedAt", "key_0") SELECT "id", "uid", "userId", "createdAt", "updatedAt", "key_0" FROM "temporary_nfc_card"`
    );
    await queryRunner.query(`DROP TABLE "temporary_nfc_card"`);
  }
}
