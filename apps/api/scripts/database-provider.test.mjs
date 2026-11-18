import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import {
  DEFAULT_DATABASE_TYPE,
  SUPPORTED_DATABASE_TYPES,
  describeLocation,
  isLocalHost,
  parseDatabaseType,
  postgresProvider,
  resolveDatabaseProvider,
  resolveSsl,
  toPositionalParameters,
} from './lib/database-provider.mjs';
import { createTestDatabase, skipWithoutPostgres } from './lib/test-postgres.mjs';

const provider = path.resolve('apps/api/scripts/lib/database-provider.mjs');
const seed = path.resolve('apps/api/scripts/seed-dev-user.mjs');
const reencrypt = path.resolve('apps/api/scripts/reencrypt-card-keys.mjs');
const cleanEnv = (extra) => ({ PATH: process.env.PATH, ...extra });

test('defaults to postgres, accepts it case-insensitively and rejects everything else by name', () => {
  assert.equal(DEFAULT_DATABASE_TYPE, 'postgres');
  assert.deepEqual(SUPPORTED_DATABASE_TYPES, ['postgres']);
  assert.equal(parseDatabaseType({}), 'postgres');
  assert.equal(parseDatabaseType({ DATABASE_TYPE: ' PostgreS ' }), 'postgres');
  assert.equal(resolveDatabaseProvider({}), postgresProvider);
  assert.throws(
    () => parseDatabaseType({ DATABASE_TYPE: 'sqlite' }),
    /Unsupported DATABASE_TYPE "sqlite"\. Supported values: postgres\./,
  );
  assert.throws(() => parseDatabaseType({ DATABASE_TYPE: 'toString' }), /Unsupported DATABASE_TYPE/);
});

test('does not echo a value that is not a plain database type name', () => {
  assert.throws(
    () => parseDatabaseType({ DATABASE_TYPE: 'postgres://user:hunter2@host/db' }),
    (error) => /redacted/.test(error.message) && !error.message.includes('hunter2'),
  );
});

test('the default location is DATABASE_URL and it is required', () => {
  assert.equal(
    postgresProvider.defaultLocation({ DATABASE_URL: ' postgres://u:p@h:5432/d ' }),
    'postgres://u:p@h:5432/d',
  );
  assert.throws(() => postgresProvider.defaultLocation({}), /DATABASE_URL is required/);
});

test('converts ? placeholders but leaves quoted question marks alone', () => {
  assert.equal(
    toPositionalParameters('SELECT a FROM t WHERE b = ? AND c = ?'),
    'SELECT a FROM t WHERE b = $1 AND c = $2',
  );
  assert.equal(
    toPositionalParameters('SELECT \'?\' , "a?" FROM t WHERE x = ?'),
    'SELECT \'?\' , "a?" FROM t WHERE x = $1',
  );
});

test('reads DATABASE_SSL and the location of a connection URL without leaking credentials', () => {
  assert.equal(resolveSsl({}), undefined);
  assert.equal(resolveSsl({ DATABASE_SSL: 'false' }), undefined);
  assert.deepEqual(resolveSsl({ DATABASE_SSL: 'true' }), { rejectUnauthorized: false });
  assert.deepEqual(resolveSsl({ DATABASE_SSL: 'verify-full' }), { rejectUnauthorized: true });
  assert.deepEqual(describeLocation('postgres://u:secret@db.example:5432/my%20db'), {
    host: 'db.example',
    database: 'my db',
  });
  assert.throws(
    () => describeLocation('not a url with secret'),
    (error) => !error.message.includes('secret'),
  );
  assert.equal(isLocalHost('127.0.0.1'), true);
  assert.equal(isLocalHost('db.example'), false);
});

test(
  'postgres provider runs statements, transactions and schema inspection',
  { skip: skipWithoutPostgres },
  async (t) => {
    const created = await createTestDatabase('attraccess_provider_test');
    t.after(() => created.drop());
    const db = await postgresProvider.open(created.url);
    try {
      await postgresProvider.run(db, 'CREATE TABLE item (id SERIAL PRIMARY KEY, name text, "camelCase" integer)');
      assert.equal(await postgresProvider.hasTable(db, 'item'), true);
      assert.equal(await postgresProvider.hasTable(db, 'missing'), false);
      assert.deepEqual(await postgresProvider.columns(db, 'item'), ['id', 'name', 'camelCase']);
      await postgresProvider.begin(db);
      const { lastID } = await postgresProvider.run(db, 'INSERT INTO item (name) VALUES (?) RETURNING id', ['a']);
      assert.equal(lastID, 1);
      await postgresProvider.rollback(db);
      assert.deepEqual(await postgresProvider.all(db, 'SELECT * FROM item'), []);
      await postgresProvider.begin(db);
      await postgresProvider.run(db, 'INSERT INTO item (name) VALUES (?)', ['b']);
      await postgresProvider.commit(db);
      assert.deepEqual(await postgresProvider.get(db, 'SELECT name FROM item'), { name: 'b' });
    } finally {
      await postgresProvider.close(db);
    }
  },
);

test('the provider CLI validates DATABASE_TYPE for the shell setup scripts', () => {
  const ok = spawnSync(process.execPath, [provider], { env: cleanEnv({}), encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout.trim(), 'postgres');
  const bad = spawnSync(process.execPath, [provider], { env: cleanEnv({ DATABASE_TYPE: 'oracle' }), encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Unsupported DATABASE_TYPE "oracle"/);
});

test('the seed and re-encryption commands refuse an unsupported DATABASE_TYPE before touching any database', () => {
  const env = cleanEnv({
    DATABASE_TYPE: 'oracle',
    DATABASE_URL: 'postgres://u:p@127.0.0.1:1/none',
    OLD_AUTH_SESSION_SECRET: 'old',
    NEW_AUTH_SESSION_SECRET: 'new',
  });
  for (const script of [seed, reencrypt]) {
    const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsupported DATABASE_TYPE "oracle"/);
  }
});
