import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttractapReaderIdentity1792200000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE "attractap_reader_identity" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "readerId" integer NOT NULL,
      "certificateFingerprint" text NOT NULL,
      "publicKeyFingerprint" text NOT NULL,
      "certificatePem" text NOT NULL,
      "installationId" text NOT NULL,
      "generation" integer NOT NULL,
      "validFrom" datetime NOT NULL,
      "validUntil" datetime NOT NULL,
      "revokedAt" datetime,
      "retiredAt" datetime,
      "enrollmentClass" text NOT NULL,
      "manifestDigest" text NOT NULL,
      CONSTRAINT "FK_reader_identity_reader" FOREIGN KEY ("readerId") REFERENCES "attractap" ("id") ON DELETE CASCADE,
      CONSTRAINT "UQ_reader_identity_generation" UNIQUE ("readerId", "generation"),
      CONSTRAINT "CK_reader_identity_generation" CHECK (generation > 0),
      CONSTRAINT "CK_reader_identity_validity" CHECK (validUntil > validFrom),
      CONSTRAINT "CK_reader_identity_class" CHECK (enrollmentClass IN ('development', 'production'))
    )`);
    await runner.query(
      'CREATE UNIQUE INDEX "UQ_reader_identity_certificate" ON "attractap_reader_identity" ("certificateFingerprint")',
    );
    await runner.query(
      'CREATE INDEX "IDX_reader_identity_public_key" ON "attractap_reader_identity" ("publicKeyFingerprint")',
    );
    await runner.query(`CREATE TRIGGER "TR_reader_identity_key_insert"
      BEFORE INSERT ON "attractap_reader_identity"
      WHEN EXISTS (SELECT 1 FROM "attractap_reader_identity"
        WHERE "publicKeyFingerprint" = NEW."publicKeyFingerprint" AND "readerId" != NEW."readerId")
      BEGIN SELECT RAISE(ABORT, 'Reader key belongs to another reader'); END`);
    await runner.query(`CREATE TRIGGER "TR_reader_identity_key_update"
      BEFORE UPDATE ON "attractap_reader_identity"
      WHEN NEW."readerId" != OLD."readerId" OR NEW."publicKeyFingerprint" != OLD."publicKeyFingerprint"
        OR EXISTS (SELECT 1 FROM "attractap_reader_identity"
          WHERE "publicKeyFingerprint" = NEW."publicKeyFingerprint" AND "readerId" != NEW."readerId")
      BEGIN SELECT RAISE(ABORT, 'Reader key ownership is immutable'); END`);
  }

  async down(runner: QueryRunner): Promise<void> {
    // Check before removing any guards or schema, including revoked/retired history.
    const history = await runner.query('SELECT 1 FROM "attractap_reader_identity" LIMIT 1');
    if (history.length) throw new Error('Cannot roll back reader security with credential history');
    await runner.query('DROP TABLE "attractap_reader_identity"');
  }
}
