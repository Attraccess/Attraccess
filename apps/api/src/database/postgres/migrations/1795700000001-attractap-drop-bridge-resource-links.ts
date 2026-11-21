import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Attractap BLE Bridge (ATT-1315): a reader without NFC serves no resource. The API drops a reader's resource links
 * when it first reports that it has no NFC; a bridge that reported it before that rule (development and QA databases)
 * kept its links. An installation upgraded from a release has no such reader yet: its readers all have NFC.
 */
export class AttractapDropBridgeResourceLinks1795700000001 implements MigrationInterface {
  name = 'AttractapDropBridgeResourceLinks1795700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "attractap_resources_resource" WHERE "attractapId" IN (SELECT "id" FROM "attractap" WHERE "firmwareCapabilitiesNfc" = false)`,
    );
  }

  public async down(): Promise<void> {
    // The links are gone for good: a reader without NFC could not use them.
  }
}
