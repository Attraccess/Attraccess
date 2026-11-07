import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttractapSecureBootKeys1792800000000 implements MigrationInterface {
  name = 'AttractapSecureBootKeys1792800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "attractap_secure_boot_key" (
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
      `CREATE UNIQUE INDEX "IDX_attractap_secure_boot_key_digest" ON "attractap_secure_boot_key" ("digest")`,
    );
    const columns = (await queryRunner.query(`PRAGMA table_info("attractap")`)) as { name: string }[];
    for (const column of ['secureBootDigest0', 'secureBootDigest1']) {
      if (!columns.some((c) => c.name === column)) {
        await queryRunner.query(`ALTER TABLE "attractap" ADD COLUMN "${column}" text`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_attractap_secure_boot_key_digest"`);
    await queryRunner.query(`DROP TABLE "attractap_secure_boot_key"`);
    await queryRunner.query(`ALTER TABLE "attractap" DROP COLUMN "secureBootDigest1"`);
    await queryRunner.query(`ALTER TABLE "attractap" DROP COLUMN "secureBootDigest0"`);
  }
}
