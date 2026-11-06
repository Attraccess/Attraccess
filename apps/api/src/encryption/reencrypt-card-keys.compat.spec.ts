import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { ConfigService } from '@nestjs/config';
import { Database } from 'sqlite3';
import { EncryptionService } from './encryption.service';

/**
 * The re-encrypt command (apps/api/scripts/reencrypt-card-keys.mjs) carries its own copy of the
 * encryption format so it runs in the production image without TypeScript sources. This runs the
 * real command against a database written by EncryptionService and reads the result back with it.
 */
const SCRIPT = resolve(__dirname, '../../scripts/reencrypt-card-keys.mjs');
const OLD_SECRET = 'old-secret-0123456789abcdef0123456789abcdef';
const NEW_SECRET = 'new-secret-fedcba9876543210fedcba9876543210';

const encryptionFor = (secret: string) =>
  new EncryptionService({ get: () => ({ AUTH_SESSION_SECRET: secret }) } as unknown as ConfigService);

type Row = { id: number; key: string | null; caPrivateKeyEncrypted?: string; serverPrivateKeyEncrypted?: string };

const sql = (db: Database, method: 'run' | 'all', query: string, params: unknown[] = []) =>
  new Promise<Row[]>((done, fail) =>
    db[method](query, params, function (this: unknown, error: Error | null, rows?: unknown) {
      if (error) fail(error);
      else done((rows as Row[]) ?? []);
    }),
  );

const runScript = (path: string) =>
  promisify(execFile)(process.execPath, [SCRIPT, '--db', path], {
    env: { PATH: process.env.PATH, OLD_AUTH_SESSION_SECRET: OLD_SECRET, NEW_AUTH_SESSION_SECRET: NEW_SECRET },
  });

describe('reencrypt-card-keys command', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'reencrypt-card-keys-'));
    path = join(dir, 'attraccess.sqlite');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('moves keys written by EncryptionService to a secret EncryptionService can read', async () => {
    const before = encryptionFor(OLD_SECRET);
    const db = new Database(path);
    await sql(db, 'run', 'CREATE TABLE nfc_card (id integer primary key, key text)');
    await sql(db, 'run', 'CREATE TABLE nfc_card_pending_change (id integer primary key, key text)');
    await sql(db, 'run', 'INSERT INTO nfc_card (id, key) VALUES (1, ?)', [
      before.encrypt('00112233445566778899aabbccddeeff'),
    ]);
    // A key stored before card keys were encrypted.
    await sql(db, 'run', 'INSERT INTO nfc_card (id, key) VALUES (2, ?)', ['ffeeddccbbaa99887766554433221100']);
    await sql(db, 'run', 'INSERT INTO nfc_card_pending_change (id, key) VALUES (1, ?)', [
      before.encrypt('0f0e0d0c0b0a09080706050403020100'),
    ]);
    await new Promise((done) => db.close(done));

    const { stdout } = await runScript(path);
    expect(stdout).toContain('{"nfc_card":2,"nfc_card_pending_change":1}');

    const after = encryptionFor(NEW_SECRET);
    const check = new Database(path);
    const cards = await sql(check, 'all', 'SELECT id, key FROM nfc_card ORDER BY id');
    const pending = await sql(check, 'all', 'SELECT id, key FROM nfc_card_pending_change');
    await new Promise((done) => check.close(done));

    expect(cards.every((row) => after.isEncrypted(row.key))).toBe(true);
    expect(cards.map((row) => after.decrypt(row.key as string))).toEqual([
      '00112233445566778899aabbccddeeff',
      'ffeeddccbbaa99887766554433221100',
    ]);
    expect(after.decrypt(pending[0].key as string)).toBe('0f0e0d0c0b0a09080706050403020100');
    expect(() => before.decrypt(cards[0].key as string)).toThrow();
  });

  it('moves the reader pairing keys so paired readers still connect under the new secret', async () => {
    const before = encryptionFor(OLD_SECRET);
    const db = new Database(path);
    await sql(db, 'run', 'CREATE TABLE nfc_card (id integer primary key, key text)');
    await sql(db, 'run', 'CREATE TABLE nfc_card_pending_change (id integer primary key, key text)');
    // Same columns as the attractap pairing migration.
    await sql(
      db,
      'run',
      `CREATE TABLE "attractap_installation" (
        "id" integer PRIMARY KEY NOT NULL,
        "installationId" text NOT NULL,
        "caCertificatePem" text NOT NULL,
        "caPrivateKeyEncrypted" text NOT NULL,
        "serverCertificatePem" text NOT NULL,
        "serverPrivateKeyEncrypted" text NOT NULL,
        "serverCertificateNotAfter" datetime NOT NULL
      )`,
    );
    const caKey = '-----BEGIN PRIVATE KEY-----\nca\n-----END PRIVATE KEY-----\n';
    const serverKey = '-----BEGIN PRIVATE KEY-----\nserver\n-----END PRIVATE KEY-----\n';
    await sql(
      db,
      'run',
      `INSERT INTO "attractap_installation" VALUES (1, 'installation', 'ca cert', ?, 'server cert', ?, datetime('now'))`,
      [before.encrypt(caKey), before.encrypt(serverKey)],
    );
    await new Promise((done) => db.close(done));

    const { stdout } = await runScript(path);
    expect(stdout).toContain('"attractap_installation.caPrivateKeyEncrypted":1');
    expect(stdout).toContain('"attractap_installation.serverPrivateKeyEncrypted":1');

    const after = encryptionFor(NEW_SECRET);
    const check = new Database(path);
    const [row] = await sql(check, 'all', 'SELECT * FROM attractap_installation');
    await new Promise((done) => check.close(done));

    expect(after.decrypt(row.caPrivateKeyEncrypted as string)).toBe(caKey);
    expect(after.decrypt(row.serverPrivateKeyEncrypted as string)).toBe(serverKey);
    expect(() => before.decrypt(row.caPrivateKeyEncrypted as string)).toThrow();
  });
});
