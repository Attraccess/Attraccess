import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * UID-only cards: a card type column and an optional key. Every existing card is an `aes` card, so nothing
 * changes on upgrade. A UID-only card has no key and no key slot.
 */
export class NfcCardType1796300000000 implements MigrationInterface {
  name = 'NfcCardType1796300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "nfc_card" ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT 'aes'`);
    await queryRunner.query(`ALTER TABLE "nfc_card" ALTER COLUMN "keyNo" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "nfc_card" ALTER COLUMN "key" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // A UID-only card has no key to put back: the cards go, as the setting that allowed them is gone too.
    await queryRunner.query(`DELETE FROM "nfc_card" WHERE "type" = 'uid-only'`);
    await queryRunner.query(`ALTER TABLE "nfc_card" ALTER COLUMN "key" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "nfc_card" ALTER COLUMN "keyNo" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "nfc_card" DROP COLUMN IF EXISTS "type"`);
  }
}
