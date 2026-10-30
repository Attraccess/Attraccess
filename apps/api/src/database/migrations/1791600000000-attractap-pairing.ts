import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttractapPairing1791600000000 implements MigrationInterface {
  name = 'AttractapPairing1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns: Array<{ name: string }> = await queryRunner.query(`PRAGMA table_info("attractap")`);
    const has = (name: string) => columns.some((c) => c.name === name);
    if (!has('pairingState')) {
      await queryRunner.query(`ALTER TABLE "attractap" ADD COLUMN "pairingState" text NOT NULL DEFAULT 'unpaired'`);
    }
    if (!has('credentialFingerprint')) {
      await queryRunner.query(`ALTER TABLE "attractap" ADD COLUMN "credentialFingerprint" text`);
    }
    if (!has('pairedAt')) await queryRunner.query(`ALTER TABLE "attractap" ADD COLUMN "pairedAt" datetime`);
    if (!has('certificateNotAfter')) {
      await queryRunner.query(`ALTER TABLE "attractap" ADD COLUMN "certificateNotAfter" datetime`);
    }
    if (!has('certificateSerial')) {
      await queryRunner.query(`ALTER TABLE "attractap" ADD COLUMN "certificateSerial" text`);
    }

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "attractap_installation" (
        "id" integer PRIMARY KEY NOT NULL,
        "installationId" text NOT NULL,
        "caCertificatePem" text NOT NULL,
        "caPrivateKeyEncrypted" text NOT NULL,
        "serverCertificatePem" text NOT NULL,
        "serverPrivateKeyEncrypted" text NOT NULL,
        "serverCertificateNotAfter" datetime NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )`,
    );

    // No foreign key on purpose: the history must survive deleting the reader.
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "attractap_credential_event" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "readerId" integer NOT NULL,
        "readerName" text NOT NULL,
        "keyFingerprint" text NOT NULL,
        "certificateSerial" text,
        "state" text NOT NULL,
        "actorId" integer,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_attractap_credential_event_reader_created" ON "attractap_credential_event" ("readerId", "createdAt")`,
    );
  }

  // Rollback keeps the credential history and the installation identity: dropping them would
  // erase the audit trail and force every paired reader to be paired again after a re-apply.
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [
      'certificateSerial',
      'certificateNotAfter',
      'pairedAt',
      'credentialFingerprint',
      'pairingState',
    ]) {
      await queryRunner.query(`ALTER TABLE "attractap" DROP COLUMN "${column}"`);
    }
  }
}
