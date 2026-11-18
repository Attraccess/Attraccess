import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  DEFAULT_DATABASE_TYPE,
  SUPPORTED_DATABASE_TYPES,
  parseDatabaseType,
  resolveDatabaseProvider,
  sqliteProvider,
} from './lib/database-provider.mjs';

const provider = path.resolve('apps/api/scripts/lib/database-provider.mjs');
const seed = path.resolve('apps/api/scripts/seed-dev-user.mjs');
const reencrypt = path.resolve('apps/api/scripts/reencrypt-card-keys.mjs');
const cleanEnv = (extra) => ({ PATH: process.env.PATH, ...extra });

test('defaults to sqlite, accepts it case-insensitively and rejects everything else by name', () => {
  assert.equal(DEFAULT_DATABASE_TYPE, 'sqlite');
  assert.deepEqual(SUPPORTED_DATABASE_TYPES, ['sqlite']);
  assert.equal(parseDatabaseType({}), 'sqlite');
  assert.equal(parseDatabaseType({ DATABASE_TYPE: ' SQLite ' }), 'sqlite');
  assert.equal(resolveDatabaseProvider({}), sqliteProvider);
  assert.throws(
    () => parseDatabaseType({ DATABASE_TYPE: 'postgres' }),
    /Unsupported DATABASE_TYPE "postgres"\. Supported values: sqlite\./,
  );
  assert.throws(() => parseDatabaseType({ DATABASE_TYPE: 'toString' }), /Unsupported DATABASE_TYPE/);
});

test('does not echo a value that is not a plain database type name', () => {
  assert.throws(
    () => parseDatabaseType({ DATABASE_TYPE: 'postgres://user:hunter2@host/db' }),
    (error) => /redacted/.test(error.message) && !error.message.includes('hunter2'),
  );
});

test('sqlite provider resolves the database next to the storage root like the API', () => {
  assert.equal(
    sqliteProvider.defaultLocation({ STORAGE_ROOT: 'data' }, '/srv/app'),
    path.join('/srv/app', 'data', 'attraccess.sqlite'),
  );
  assert.equal(sqliteProvider.defaultLocation({}, '/srv/app'), path.join('/srv/app', 'storage', 'attraccess.sqlite'));
});

test('sqlite provider runs statements, transactions and schema inspection', async () => {
  const db = await sqliteProvider.open(':memory:');
  try {
    await sqliteProvider.run(db, 'CREATE TABLE item (id INTEGER PRIMARY KEY, name TEXT)');
    assert.equal(await sqliteProvider.hasTable(db, 'item'), true);
    assert.equal(await sqliteProvider.hasTable(db, 'missing'), false);
    assert.deepEqual(await sqliteProvider.columns(db, 'item'), ['id', 'name']);
    await sqliteProvider.begin(db, { writeLock: true });
    const { lastID } = await sqliteProvider.run(db, 'INSERT INTO item (name) VALUES (?)', ['a']);
    assert.equal(lastID, 1);
    await sqliteProvider.rollback(db);
    assert.deepEqual(await sqliteProvider.all(db, 'SELECT * FROM item'), []);
    await sqliteProvider.begin(db);
    await sqliteProvider.run(db, 'INSERT INTO item (name) VALUES (?)', ['b']);
    await sqliteProvider.commit(db);
    assert.deepEqual(await sqliteProvider.get(db, 'SELECT name FROM item'), { name: 'b' });
  } finally {
    await sqliteProvider.close(db);
  }
});

test('the provider CLI validates DATABASE_TYPE for the shell setup scripts', () => {
  const ok = spawnSync(process.execPath, [provider], { env: cleanEnv({}), encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout.trim(), 'sqlite');
  const bad = spawnSync(process.execPath, [provider], { env: cleanEnv({ DATABASE_TYPE: 'oracle' }), encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Unsupported DATABASE_TYPE "oracle"/);
});

test('the seed and re-encryption commands refuse an unsupported DATABASE_TYPE before touching any database', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'attraccess-provider-test-'));
  try {
    const storage = path.join(directory, 'storage');
    const database = path.join(directory, 'x.sqlite');
    const env = cleanEnv({
      DATABASE_TYPE: 'oracle',
      STORAGE_ROOT: storage,
      OLD_AUTH_SESSION_SECRET: 'old',
      NEW_AUTH_SESSION_SECRET: 'new',
    });
    const seeded = spawnSync(process.execPath, [seed, '--db', database], { env, encoding: 'utf8' });
    assert.notEqual(seeded.status, 0);
    assert.match(seeded.stderr, /Unsupported DATABASE_TYPE "oracle"/);
    const reencrypted = spawnSync(process.execPath, [reencrypt, '--db', database], { env, encoding: 'utf8' });
    assert.notEqual(reencrypted.status, 0);
    assert.match(reencrypted.stderr, /Unsupported DATABASE_TYPE "oracle"/);
    assert.equal(existsSync(database), false);
    assert.equal(existsSync(storage), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
