import { MigrationInterface, QueryRunner } from 'typeorm';

export class NfcCardSingleKey1760467441063 implements MigrationInterface {
  name = 'NfcCardSingleKey1760467441063';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "nfc_card"`);
    await queryRunner.query(
      `CREATE TABLE "nfc_card" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "uid" text NOT NULL, "userId" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "lastSeen" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "isActive" boolean NOT NULL DEFAULT (0), "keyNo" integer NOT NULL, "key" text NOT NULL, CONSTRAINT "FK_6fab76f70c8b8bd902e6e4e115e" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "nfc_card"`);
    await queryRunner.query(
      `CREATE TABLE "nfc_card" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "uid" text NOT NULL, "userId" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "key_0" text NOT NULL DEFAULT ('0000000000000000'), "lastSeen" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "isActive" boolean NOT NULL DEFAULT (0), CONSTRAINT "FK_6fab76f70c8b8bd902e6e4e115e" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
  }
}
