import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { postgresProvider } from './lib/database-provider.mjs';
import { createTestDatabase, skipWithoutPostgres } from './lib/test-postgres.mjs';
import {
  decrypt,
  deriveKey,
  encrypt,
  parseArgs,
  reencryptCardKeys,
  resolveDatabaseUrl,
} from './reencrypt-card-keys.mjs';

const opts = { skip: skipWithoutPostgres };

/** A fresh database with the two card tables; the handle is the provider's connection. */
async function database(t) {
  const created = await createTestDatabase('attraccess_reencrypt_test');
  t.after(() => created.drop());
  await created.db.query('CREATE TABLE nfc_card (id integer primary key, key text)');
  await created.db.query('CREATE TABLE nfc_card_pending_change (id integer primary key, key text)');
  return created.db;
}
const run = async (db, sql, params = []) => void (await postgresProvider.run(db, sql, params));
const all = async (db, sql) => postgresProvider.all(db, sql);

test('moves card keys to the new secret', opts, async (t) => {
  const db = await database(t);
  const oldKey = deriveKey('old-secret');
  await run(db, 'INSERT INTO nfc_card (id, key) VALUES (1, ?)', [encrypt(oldKey, '00112233445566778899aabbccddeeff')]);
  await run(db, 'INSERT INTO nfc_card_pending_change (id, key) VALUES (1, ?)', [
    encrypt(oldKey, 'ffeeddccbbaa99887766554433221100'),
  ]);
  await run(db, 'INSERT INTO nfc_card_pending_change (id, key) VALUES (2, NULL)');

  assert.deepEqual(await reencryptCardKeys(db, 'old-secret', 'new-secret'), {
    nfc_card: 1,
    nfc_card_pending_change: 1,
  });

  const [card] = await all(db, 'SELECT key FROM nfc_card');
  assert.equal(decrypt(deriveKey('new-secret'), card.key), '00112233445566778899aabbccddeeff');
  assert.throws(() => decrypt(deriveKey('old-secret'), card.key));
});

test('moves the reader pairing keys too', opts, async (t) => {
  const db = await database(t);
  await run(
    db,
    'CREATE TABLE attractap_installation (id integer primary key, "caPrivateKeyEncrypted" text NOT NULL, "serverPrivateKeyEncrypted" text NOT NULL)',
  );
  const oldKey = deriveKey('old-secret');
  await run(db, 'INSERT INTO attractap_installation VALUES (1, ?, ?)', [
    encrypt(oldKey, 'ca private key pem'),
    encrypt(oldKey, 'server private key pem'),
  ]);

  assert.deepEqual(await reencryptCardKeys(db, 'old-secret', 'new-secret'), {
    nfc_card: 0,
    nfc_card_pending_change: 0,
    'attractap_installation.caPrivateKeyEncrypted': 1,
    'attractap_installation.serverPrivateKeyEncrypted': 1,
  });

  const [row] = await all(db, 'SELECT * FROM attractap_installation');
  const newKey = deriveKey('new-secret');
  assert.equal(decrypt(newKey, row.caPrivateKeyEncrypted), 'ca private key pem');
  assert.equal(decrypt(newKey, row.serverPrivateKeyEncrypted), 'server private key pem');
});

test('counts an empty installation table and skips one an older database does not have', opts, async (t) => {
  const db = await database(t);
  assert.deepEqual(await reencryptCardKeys(db, 'old-secret', 'new-secret'), {
    nfc_card: 0,
    nfc_card_pending_change: 0,
  });
  await run(
    db,
    'CREATE TABLE attractap_installation (id integer primary key, "caPrivateKeyEncrypted" text, "serverPrivateKeyEncrypted" text)',
  );
  assert.equal(
    (await reencryptCardKeys(db, 'old-secret', 'new-secret'))['attractap_installation.caPrivateKeyEncrypted'],
    0,
  );
});

test('names the column of a pairing key that does not decrypt', opts, async (t) => {
  const db = await database(t);
  await run(
    db,
    'CREATE TABLE attractap_installation (id integer primary key, "caPrivateKeyEncrypted" text, "serverPrivateKeyEncrypted" text)',
  );
  const oldKey = deriveKey('old-secret');
  const ca = encrypt(oldKey, 'ca');
  await run(db, 'INSERT INTO attractap_installation VALUES (1, ?, ?)', [ca, encrypt(deriveKey('other'), 'server')]);
  await assert.rejects(
    () => reencryptCardKeys(db, 'old-secret', 'new-secret'),
    /attractap_installation\.serverPrivateKeyEncrypted row 1 cannot be read/,
  );
  assert.equal(
    (await all(db, 'SELECT "caPrivateKeyEncrypted" FROM attractap_installation'))[0].caPrivateKeyEncrypted,
    ca,
  );
});

test('writes nothing for a dry run or when a value does not decrypt', opts, async (t) => {
  const db = await database(t);
  const stored = encrypt(deriveKey('old-secret'), 'aa');
  await run(db, 'INSERT INTO nfc_card (id, key) VALUES (1, ?)', [stored]);
  await reencryptCardKeys(db, 'old-secret', 'new-secret', { dryRun: true });
  assert.equal((await all(db, 'SELECT key FROM nfc_card'))[0].key, stored);

  await run(db, 'INSERT INTO nfc_card (id, key) VALUES (2, ?)', [encrypt(deriveKey('somebody-else'), 'bb')]);
  await assert.rejects(
    () => reencryptCardKeys(db, 'old-secret', 'new-secret'),
    /nfc_card\.key row 2 cannot be read with OLD_AUTH_SESSION_SECRET/,
  );
  assert.equal((await all(db, 'SELECT key FROM nfc_card WHERE id = 1'))[0].key, stored);
});

test('refuses missing or identical secrets', opts, async (t) => {
  const db = await database(t);
  await assert.rejects(() => reencryptCardKeys(db, '', 'x'));
  await assert.rejects(() => reencryptCardKeys(db, 'same', 'same'));
});

test('finds the database like the API does, unless --db names it', () => {
  const env = { DATABASE_URL: ' postgres://u:p@db:5432/attraccess ' };
  assert.equal(resolveDatabaseUrl(env), 'postgres://u:p@db:5432/attraccess');
  assert.throws(() => resolveDatabaseUrl({}), /DATABASE_URL is required/);
  assert.throws(
    () => resolveDatabaseUrl({ DATABASE_TYPE: 'sqlite', DATABASE_URL: 'x' }),
    /Unsupported DATABASE_TYPE "sqlite"/,
  );

  assert.deepEqual(parseArgs([], env), { dryRun: false, databaseUrl: 'postgres://u:p@db:5432/attraccess' });
  assert.deepEqual(parseArgs(['--', '--dry-run', '--db', 'postgres://copy/db'], {}), {
    dryRun: true,
    databaseUrl: 'postgres://copy/db',
  });
  assert.equal(parseArgs(['--db=postgres://x/y'], {}).databaseUrl, 'postgres://x/y');
  assert.throws(() => parseArgs(['--db'], env), /--db needs a connection URL/);
  assert.throws(() => parseArgs(['--secret=abc'], env), /unknown argument/);
});

test('runs as a plain Node script without TypeScript sources', async () => {
  const source = await readFile(fileURLToPath(new URL('./reencrypt-card-keys.mjs', import.meta.url)), 'utf8');
  assert.doesNotMatch(source, /from\s+['"][^'"]+\.ts['"]/);
  assert.doesNotMatch(source, /import\(\s*['"][^'"]+\.ts['"]\s*\)/);
});
