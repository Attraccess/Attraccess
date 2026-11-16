import { MigrationInterface, QueryRunner } from 'typeorm';

/** Per reader: the digests burned to KEY0/KEY1 and the key the server signs its images with. */
const SECURE_BOOT_READER_COLUMNS = ['secureBootDigest0', 'secureBootDigest1', 'secureBootSignerDigest'];

export class AttractapSecureBootKeys1792800000000 implements MigrationInterface {
  name = 'AttractapSecureBootKeys1792800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "attractap_secure_boot_key" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "role" text NOT NULL,
        "publicKeyPem" text NOT NULL,
        "digest" text NOT NULL,
        "fingerprint" text NOT NULL,
        "privateKeyEncrypted" text,
        "verifiedAt" datetime,
        "restoredAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_attractap_secure_boot_key_digest" ON "attractap_secure_boot_key" ("digest")`,
    );
    const columns = (await queryRunner.query(`PRAGMA table_info("attractap")`)) as { name: string }[];
    for (const column of SECURE_BOOT_READER_COLUMNS) {
      if (!columns.some((c) => c.name === column)) {
        await queryRunner.query(`ALTER TABLE "attractap" ADD COLUMN "${column}" text`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attractap_secure_boot_key_digest"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attractap_secure_boot_key"`);
    const columns = (await queryRunner.query(`PRAGMA table_info("attractap")`)) as { name: string }[];
    for (const column of [...SECURE_BOOT_READER_COLUMNS].reverse()) {
      if (columns.some((c) => c.name === column)) {
        await queryRunner.query(`ALTER TABLE "attractap" DROP COLUMN "${column}"`);
      }
    }
  }
}
