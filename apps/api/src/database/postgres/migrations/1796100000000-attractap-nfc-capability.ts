import { MigrationInterface, QueryRunner } from 'typeorm';

/** Attractap BLE Bridge (ATT-1315): readers without NFC. Every existing reader has NFC until it reports otherwise. */
export class AttractapNfcCapability1796100000000 implements MigrationInterface {
  name = 'AttractapNfcCapability1796100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attractap" ADD COLUMN IF NOT EXISTS "firmwareCapabilitiesNfc" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attractap" DROP COLUMN IF EXISTS "firmwareCapabilitiesNfc"`);
  }
}
