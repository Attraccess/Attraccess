import { MigrationInterface, QueryRunner } from 'typeorm';

export class NfcCardPendingChange1791800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "nfc_card_pending_change" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "uid" text NOT NULL,
        "kind" varchar(16) NOT NULL,
        "userId" integer,
        "cardId" integer,
        "keyNo" integer NOT NULL,
        "key" text,
        "actorId" integer,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )`,
    );
    await queryRunner.query('CREATE INDEX "IDX_nfc_card_pending_change_uid" ON "nfc_card_pending_change" ("uid")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_nfc_card_pending_change_uid"');
    await queryRunner.query('DROP TABLE "nfc_card_pending_change"');
  }
}
