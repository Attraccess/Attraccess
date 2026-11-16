import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import sqlite3pkg from 'sqlite3';
import {
  decrypt,
  deriveKey,
  encrypt,
  parseArgs,
  reencryptCardKeys,
  resolveDatabasePath,
} from './reencrypt-card-keys.mjs';

const run = (db, sql, params = []) =>
  new Promise((resolve, reject) => db.run(sql, params, (e) => (e ? reject(e) : resolve())));
const all = (db, sql) => new Promise((resolve, reject) => db.all(sql, (e, rows) => (e ? reject(e) : resolve(rows))));

async function database() {
  const db = new (sqlite3pkg.verbose().Database)(':memory:');
  await run(db, 'CREATE TABLE nfc_card (id integer primary key, key text)');
  await run(db, 'CREATE TABLE nfc_card_pending_change (id integer primary key, key text)');
  return db;
}

test('moves card keys to the new secret', async () => {
  const db = await database();
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

test('moves the reader pairing keys too', async () => {
  const db = await database();
  await run(
    db,
    'CREATE TABLE attractap_installation (id integer primary key, caPrivateKeyEncrypted text NOT NULL, serverPrivateKeyEncrypted text NOT NULL)',
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

test('counts an empty installation table and skips one an older database does not have', async () => {
  const db = await database();
  assert.deepEqual(await reencryptCardKeys(db, 'old-secret', 'new-secret'), {
    nfc_card: 0,
    nfc_card_pending_change: 0,
  });
  await run(
    db,
    'CREATE TABLE attractap_installation (id integer primary key, caPrivateKeyEncrypted text, serverPrivateKeyEncrypted text)',
  );
  assert.equal(
    (await reencryptCardKeys(db, 'old-secret', 'new-secret'))['attractap_installation.caPrivateKeyEncrypted'],
    0,
  );
});

test('names the column of a pairing key that does not decrypt', async () => {
  const db = await database();
  await run(
    db,
    'CREATE TABLE attractap_installation (id integer primary key, caPrivateKeyEncrypted text, serverPrivateKeyEncrypted text)',
  );
  const oldKey = deriveKey('old-secret');
  const ca = encrypt(oldKey, 'ca');
  await run(db, 'INSERT INTO attractap_installation VALUES (1, ?, ?)', [ca, encrypt(deriveKey('other'), 'server')]);
  await assert.rejects(
    () => reencryptCardKeys(db, 'old-secret', 'new-secret'),
    /attractap_installation\.serverPrivateKeyEncrypted row 1 cannot be read/,
  );
  assert.equal(
    (await all(db, 'SELECT caPrivateKeyEncrypted FROM attractap_installation'))[0].caPrivateKeyEncrypted,
    ca,
  );
});

test('writes nothing for a dry run or when a value does not decrypt', async () => {
  const db = await database();
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

test('refuses missing or identical secrets', async () => {
  const db = await database();
  await assert.rejects(() => reencryptCardKeys(db, '', 'x'));
  await assert.rejects(() => reencryptCardKeys(db, 'same', 'same'));
});

test('finds the database like the API does, unless --db names it', async () => {
  const { resolveDatabasePath: apiResolveDatabasePath } = await import('../src/config/storage-path.ts');
  for (const env of [{}, { STORAGE_ROOT: '/srv/attraccess' }, { STORAGE_ROOT: 'relative/storage' }]) {
    assert.equal(resolveDatabasePath(env, '/work'), apiResolveDatabasePath(env, '/work'));
  }
  assert.equal(resolveDatabasePath({ STORAGE_ROOT: '/app/storage' }, '/app'), '/app/storage/attraccess.sqlite');

  assert.deepEqual(parseArgs([], { STORAGE_ROOT: '/app/storage' }, '/app'), {
    dryRun: false,
    databasePath: '/app/storage/attraccess.sqlite',
  });
  assert.deepEqual(parseArgs(['--', '--dry-run', '--db', 'copy.sqlite'], {}, '/backup'), {
    dryRun: true,
    databasePath: '/backup/copy.sqlite',
  });
  assert.equal(parseArgs(['--db=/data/a.sqlite'], {}, '/x').databasePath, '/data/a.sqlite');
  assert.throws(() => parseArgs(['--db']), /--db needs a path/);
  assert.throws(() => parseArgs(['--secret=abc']), /unknown argument/);
});

test('runs as a plain Node script without TypeScript sources', async () => {
  const source = await readFile(fileURLToPath(new URL('./reencrypt-card-keys.mjs', import.meta.url)), 'utf8');
  assert.doesNotMatch(source, /from\s+['"][^'"]+\.ts['"]/);
  assert.doesNotMatch(source, /import\(\s*['"][^'"]+\.ts['"]\s*\)/);
});
