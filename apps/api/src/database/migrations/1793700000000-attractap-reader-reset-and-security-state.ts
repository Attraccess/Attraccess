import { MigrationInterface, QueryRunner } from 'typeorm';

const COLUMNS_BEFORE_PAIRING_STATE = `
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "name" text NOT NULL,`;

const LIFECYCLE_COLUMNS = `
  "lastConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "firstConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "firmwareName" text,
  "firmwareVariant" text,
  "firmwareVersion" text,
  "firmwareCapabilitiesResourceselection" boolean NOT NULL DEFAULT (1),
  "ledBrightness" integer NOT NULL DEFAULT (255),
  "firmwareCapabilitiesResourceactionselection" boolean NOT NULL DEFAULT (0),
  "firmwareCapabilitiesCardenrollment" boolean NOT NULL DEFAULT (1),
  "firmwareCapabilitiesHasleds" boolean NOT NULL DEFAULT (0),`;

const CREDENTIAL_COLUMNS = `
  "credentialFingerprint" text,
  "pairedAt" datetime,
  "certificateNotAfter" datetime,
  "certificateSerial" text,
  "firmwareCapabilitiesUi" text,
  "firmwareCapabilitiesResetreason" text,
  "firmwareCapabilitiesCardrelay" boolean NOT NULL DEFAULT (0),
  "secureBootDigest0" text,
  "secureBootDigest1" text,
  "secureBootSignerDigest" text,
  "allowPluginBle" boolean NOT NULL DEFAULT (0)`;

const SECURITY_COLUMNS = `,
  "secured" boolean NOT NULL DEFAULT (0),
  "securedAt" datetime,
  "firmwareProfile" text,
  "secureVersion" integer,
  "efuseSecureVersion" integer,
  "securityReportCheckedAt" datetime,
  "securityReportProblems" text`;

/** The reader table as it was: with the token hash, and records that never paired are `unpaired`. */
const OLD_TABLE = `${COLUMNS_BEFORE_PAIRING_STATE}
  "apiTokenHash" text NOT NULL,${LIFECYCLE_COLUMNS}
  "pairingState" text NOT NULL DEFAULT 'unpaired',${CREDENTIAL_COLUMNS}`;

/** The reader table now: no token hash, a record without a credential is `revoked`, and the security state. */
const NEW_TABLE = `${COLUMNS_BEFORE_PAIRING_STATE}${LIFECYCLE_COLUMNS}
  "pairingState" text NOT NULL DEFAULT 'revoked',${CREDENTIAL_COLUMNS}${SECURITY_COLUMNS}`;

/** The columns both shapes share, copied when the table is rebuilt. */
const SHARED = [
  'id',
  'name',
  'lastConnection',
  'firstConnection',
  'firmwareName',
  'firmwareVariant',
  'firmwareVersion',
  'firmwareCapabilitiesResourceselection',
  'ledBrightness',
  'firmwareCapabilitiesResourceactionselection',
  'firmwareCapabilitiesCardenrollment',
  'firmwareCapabilitiesHasleds',
  'pairingState',
  'credentialFingerprint',
  'pairedAt',
  'certificateNotAfter',
  'certificateSerial',
  'firmwareCapabilitiesUi',
  'firmwareCapabilitiesResetreason',
  'firmwareCapabilitiesCardrelay',
  'secureBootDigest0',
  'secureBootDigest1',
  'secureBootSignerDigest',
  'allowPluginBle',
]
  .map((column) => `"${column}"`)
  .join(', ');

/** Everything that belongs to one reader record, children first. Server-wide rows (installation CA, Secure Boot keys) stay. */
const READER_DEPENDANTS = [
  `DELETE FROM "plugin_ble_endpoint"`,
  `DELETE FROM "attractap_resources_resource"`,
  `DELETE FROM "attractap_crash_report"`,
  `DELETE FROM "reader_ui_reader_settings"`,
  `DELETE FROM "reader_ui_alert" WHERE "readerId" IS NOT NULL`,
  // The history names readers by id and has no foreign key; without its readers it describes nothing.
  `DELETE FROM "attractap_credential_event"`,
  // The card writer allow-list holds reader ids. The mode stays: "selected" with no reader lists none (fail closed).
  `DELETE FROM "setting" WHERE "parent" = 'attractap' AND "key" = 'card_writer_readers'`,
];

/**
 * Readers sign in with their certificate only (ATT-1207). The token column goes, and so does every reader record:
 * a reader that only knew a token, and a reader paired before this version, pairs again as a new reader. Nothing is
 * copied or kept, and the audit log is not touched. Adds the security state the server keeps per reader.
 */
export class AttractapReaderResetAndSecurityState1793700000000 implements MigrationInterface {
  name = 'AttractapReaderResetAndSecurityState1793700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of READER_DEPENDANTS) await queryRunner.query(statement);
    await queryRunner.query(`DELETE FROM "attractap"`);
    await this.rebuild(queryRunner, NEW_TABLE, SHARED, SHARED);
  }

  /**
   * Back to the shape with the token column. The readers paired meanwhile stay and get an empty token hash, which no
   * token matches: an older server knows them by their certificate only. Records that never had a credential become
   * `unpaired` again.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "attractap" SET "pairingState" = 'unpaired' WHERE "pairingState" = 'revoked' AND "credentialFingerprint" IS NULL`,
    );
    await this.rebuild(queryRunner, OLD_TABLE, `${SHARED}, "apiTokenHash"`, `${SHARED}, ''`);
  }

  /**
   * Rebuilds the reader table and keeps its id sequence. Dropping the AUTOINCREMENT table drops its `sqlite_sequence`
   * row, and ids would start at 1 again: the audit log, metrics and credential history name readers by id, so a new
   * reader must never reuse the id of a deleted one.
   */
  private async rebuild(queryRunner: QueryRunner, definition: string, into: string, from: string): Promise<void> {
    const sequence = await this.readSequence(queryRunner);
    await queryRunner.query(`CREATE TABLE "temporary_attractap" (${definition})`);
    await queryRunner.query(`INSERT INTO "temporary_attractap" (${into}) SELECT ${from} FROM "attractap"`);
    await queryRunner.query(`DROP TABLE "attractap"`);
    await queryRunner.query(`ALTER TABLE "temporary_attractap" RENAME TO "attractap"`);
    await queryRunner.query(`DELETE FROM "sqlite_sequence" WHERE "name" = 'attractap'`);
    if (sequence > 0) {
      await queryRunner.query(`INSERT INTO "sqlite_sequence" ("name", "seq") VALUES ('attractap', ?)`, [sequence]);
    }
  }

  /** The highest reader id ever handed out: the sequence row, or the highest id still in the table. */
  private async readSequence(queryRunner: QueryRunner): Promise<number> {
    const [row] = (await queryRunner.query(
      `SELECT max(
        coalesce((SELECT "seq" FROM "sqlite_sequence" WHERE "name" = 'attractap'), 0),
        coalesce((SELECT max("id") FROM "attractap"), 0)
      ) AS "seq"`,
    )) as { seq: number }[];
    return Number(row?.seq ?? 0);
  }
}
