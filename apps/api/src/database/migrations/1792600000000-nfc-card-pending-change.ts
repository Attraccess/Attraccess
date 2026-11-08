import { MigrationInterface, QueryRunner } from 'typeorm';

export class NfcCardPendingChange1792600000000 implements MigrationInterface {
  name = 'NfcCardPendingChange1792600000000';

  // Tolerates an existing table: dev and lab databases may have run this migration under an earlier name.
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('nfc_card_pending_change'))) {
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
    }
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_nfc_card_pending_change_uid" ON "nfc_card_pending_change" ("uid")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_nfc_card_pending_change_uid"');
    await queryRunner.query('DROP TABLE IF EXISTS "nfc_card_pending_change"');
  }
}
