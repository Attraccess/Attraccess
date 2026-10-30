import assert from 'node:assert/strict';
import test from 'node:test';
import sqlite3pkg from 'sqlite3';
import { decrypt, deriveKey, encrypt, reencryptCardKeys } from './reencrypt-card-keys.mjs';

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

test('writes nothing for a dry run or when a value does not decrypt', async () => {
  const db = await database();
  const stored = encrypt(deriveKey('old-secret'), 'aa');
  await run(db, 'INSERT INTO nfc_card (id, key) VALUES (1, ?)', [stored]);
  await reencryptCardKeys(db, 'old-secret', 'new-secret', { dryRun: true });
  assert.equal((await all(db, 'SELECT key FROM nfc_card'))[0].key, stored);

  await run(db, 'INSERT INTO nfc_card (id, key) VALUES (2, ?)', [encrypt(deriveKey('somebody-else'), 'bb')]);
  await assert.rejects(() => reencryptCardKeys(db, 'old-secret', 'new-secret'));
  assert.equal((await all(db, 'SELECT key FROM nfc_card WHERE id = 1'))[0].key, stored);
});

test('refuses missing or identical secrets', async () => {
  const db = await database();
  await assert.rejects(() => reencryptCardKeys(db, '', 'x'));
  await assert.rejects(() => reencryptCardKeys(db, 'same', 'same'));
});
