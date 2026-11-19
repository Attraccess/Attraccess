import { DataSource } from 'typeorm';
import { AttractapReaderResetAndSecurityState1793700000000 } from './1793700000000-attractap-reader-reset-and-security-state';

const OLD_READER_TABLE = `CREATE TABLE "attractap" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "apiTokenHash" text NOT NULL, "lastConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "firstConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "firmwareName" text, "firmwareVariant" text, "firmwareVersion" text, "firmwareCapabilitiesResourceselection" boolean NOT NULL DEFAULT (1), "ledBrightness" integer NOT NULL DEFAULT (255), "firmwareCapabilitiesResourceactionselection" boolean NOT NULL DEFAULT (0), "firmwareCapabilitiesCardenrollment" boolean NOT NULL DEFAULT (1), "firmwareCapabilitiesHasleds" boolean NOT NULL DEFAULT (0), "pairingState" text NOT NULL DEFAULT 'unpaired', "credentialFingerprint" text, "pairedAt" datetime, "certificateNotAfter" datetime, "certificateSerial" text, "firmwareCapabilitiesUi" text, "firmwareCapabilitiesResetreason" text, "firmwareCapabilitiesCardrelay" boolean NOT NULL DEFAULT (0), "secureBootDigest0" text, "secureBootDigest1" text, "secureBootSignerDigest" text, "allowPluginBle" boolean NOT NULL DEFAULT (0))`;

describe('AttractapReaderResetAndSecurityState migration', () => {
  let source: DataSource;
  const migration = new AttractapReaderResetAndSecurityState1793700000000();

  beforeEach(async () => {
    source = await new DataSource({ type: 'better-sqlite3', database: ':memory:' }).initialize();
    await source.query('PRAGMA foreign_keys = ON');
    await source.query(`CREATE TABLE "resource" ("id" integer PRIMARY KEY NOT NULL)`);
    await source.query(OLD_READER_TABLE);
    const child = (table: string, column: string) =>
      source.query(
        `CREATE TABLE "${table}" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "${column}" integer NOT NULL, CONSTRAINT "FK_${table}" FOREIGN KEY ("${column}") REFERENCES "attractap" ("id") ON DELETE CASCADE)`,
      );
    await child('attractap_crash_report', 'attractapId');
    await child('plugin_ble_endpoint', 'readerId');
    await child('attractap_resources_resource', 'attractapId');
    await source.query(`CREATE TABLE "reader_ui_reader_settings" ("readerId" integer PRIMARY KEY NOT NULL)`);
    await source.query(`CREATE TABLE "reader_ui_alert" ("id" integer PRIMARY KEY NOT NULL, "readerId" integer)`);
    await source.query(
      `CREATE TABLE "attractap_credential_event" ("id" integer PRIMARY KEY NOT NULL, "readerId" integer NOT NULL)`,
    );
    await source.query(`CREATE TABLE "attractap_installation" ("id" integer PRIMARY KEY NOT NULL)`);
    await source.query(`CREATE TABLE "attractap_secure_boot_key" ("id" integer PRIMARY KEY NOT NULL)`);
    await source.query(
      `CREATE TABLE "setting" ("id" integer PRIMARY KEY NOT NULL, "parent" text NOT NULL, "key" text NOT NULL, "value" text)`,
    );

    await source.query(
      `INSERT INTO "attractap" ("id", "name", "apiTokenHash", "pairingState", "credentialFingerprint") VALUES (1, 'token reader', 'hash', 'unpaired', NULL), (2, 'paired reader', '', 'paired', 'fp')`,
    );
    for (const table of ['attractap_crash_report', 'attractap_resources_resource']) {
      await source.query(`INSERT INTO "${table}" ("attractapId") VALUES (1), (2)`);
    }
    await source.query(`INSERT INTO "plugin_ble_endpoint" ("readerId") VALUES (2)`);
    await source.query(`INSERT INTO "reader_ui_reader_settings" ("readerId") VALUES (2)`);
    await source.query(`INSERT INTO "reader_ui_alert" ("id", "readerId") VALUES (1, 2), (2, NULL)`);
    await source.query(`INSERT INTO "attractap_credential_event" ("id", "readerId") VALUES (1, 2)`);
    await source.query(`INSERT INTO "attractap_installation" ("id") VALUES (1)`);
    await source.query(`INSERT INTO "attractap_secure_boot_key" ("id") VALUES (1)`);
    await source.query(
      `INSERT INTO "setting" ("id", "parent", "key", "value") VALUES (1, 'attractap', 'card_writer_readers', '[2]'), (2, 'attractap', 'card_writer_mode', 'selected'), (3, 'other', 'card_writer_readers', 'x')`,
    );
  });

  afterEach(() => source.destroy());

  const run = async (direction: 'up' | 'down') => {
    const runner = source.createQueryRunner();
    try {
      await migration[direction](runner);
    } finally {
      await runner.release();
    }
  };
  const count = async (table: string) =>
    ((await source.query(`SELECT count(*) AS n FROM "${table}"`)) as { n: number }[])[0].n;
  const readerColumns = async () =>
    ((await source.query(`PRAGMA table_info("attractap")`)) as { name: string }[]).map((c) => c.name);

  it('removes every reader and everything that hangs off one, and nothing server-wide', async () => {
    await run('up');

    for (const table of [
      'attractap',
      'attractap_crash_report',
      'plugin_ble_endpoint',
      'attractap_resources_resource',
      'reader_ui_reader_settings',
      'attractap_credential_event',
    ]) {
      expect({ table, rows: await count(table) }).toEqual({ table, rows: 0 });
    }
    // Alerts of the server stay; the reader list in the card writer setting goes, its mode and other parents stay.
    expect(await source.query(`SELECT "id" FROM "reader_ui_alert"`)).toEqual([{ id: 2 }]);
    expect(await source.query(`SELECT "key", "parent" FROM "setting" ORDER BY "id"`)).toEqual([
      { key: 'card_writer_mode', parent: 'attractap' },
      { key: 'card_writer_readers', parent: 'other' },
    ]);
    expect(await count('attractap_installation')).toBe(1);
    expect(await count('attractap_secure_boot_key')).toBe(1);
  });

  it('drops the token hash, adds the security columns and starts a new record without a credential', async () => {
    await run('up');

    const columns = await readerColumns();
    expect(columns).not.toContain('apiTokenHash');
    expect(columns).toEqual(
      expect.arrayContaining([
        'secured',
        'securedAt',
        'firmwareProfile',
        'secureVersion',
        'efuseSecureVersion',
        'securityReportCheckedAt',
        'securityReportProblems',
      ]),
    );
    await source.query(`INSERT INTO "attractap" ("name") VALUES ('new')`);
    expect(await source.query(`SELECT "pairingState", "secured", "securityReportProblems" FROM "attractap"`)).toEqual([
      { pairingState: 'revoked', secured: 0, securityReportProblems: null },
    ]);
    // The children still point at the rebuilt table.
    await source.query(`INSERT INTO "attractap_crash_report" ("attractapId") VALUES (1)`);
    await source.query(`DELETE FROM "attractap" WHERE "id" = 1`);
    expect(await count('attractap_crash_report')).toBe(0);
  });

  it('reverts to the shape with the token hash and keeps the readers paired meanwhile', async () => {
    await run('up');
    await source.query(
      `INSERT INTO "attractap" ("name", "pairingState", "credentialFingerprint") VALUES ('paired after', 'paired', 'fp2'), ('revoked after', 'revoked', 'fp3'), ('no credential', 'revoked', NULL)`,
    );

    await run('down');

    expect(await readerColumns()).toContain('apiTokenHash');
    expect(await readerColumns()).not.toContain('secured');
    expect(await source.query(`SELECT "name", "apiTokenHash", "pairingState" FROM "attractap" ORDER BY "id"`)).toEqual([
      { name: 'paired after', apiTokenHash: '', pairingState: 'paired' },
      { name: 'revoked after', apiTokenHash: '', pairingState: 'revoked' },
      { name: 'no credential', apiTokenHash: '', pairingState: 'unpaired' },
    ]);
    await run('up');
    expect(await count('attractap')).toBe(0);
  });
});
