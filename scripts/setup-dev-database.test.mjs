import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import pg from 'pg';
import {
  adminUrl,
  databaseNameFor,
  ensureDevDatabase,
  readEnvValue,
  setEnvValue,
  withDatabase,
} from './setup-dev-database.mjs';

test('derives a sanitized database name of at most 63 characters', () => {
  assert.equal(databaseNameFor('att-584-migrate-database'), 'attraccess_att_584_migrate_database');
  assert.equal(databaseNameFor('My Worktree!!'), 'attraccess_my_worktree');
  assert.equal(databaseNameFor('///'), 'attraccess_dev');
  const long = databaseNameFor('a'.repeat(100));
  assert.ok(long.length <= 63);
  assert.match(long, /^attraccess_a+_[0-9a-f]{8}$/);
  assert.notEqual(long, databaseNameFor(`${'a'.repeat(99)}b`));
});

test('builds the admin URL from POSTGRES_PORT unless DEV_POSTGRES_URL is set', () => {
  assert.equal(adminUrl({}), 'postgres://attraccess:attraccess@127.0.0.1:5432/postgres');
  assert.equal(adminUrl({ POSTGRES_PORT: '55432' }), 'postgres://attraccess:attraccess@127.0.0.1:55432/postgres');
  assert.equal(adminUrl({ DEV_POSTGRES_URL: 'postgres://a:b@h:1/postgres' }), 'postgres://a:b@h:1/postgres');
  assert.equal(withDatabase('postgres://a:b@h:1/postgres', 'x_y'), 'postgres://a:b@h:1/x_y');
});

test('sets and reads .env values without touching other lines', () => {
  assert.equal(setEnvValue('A=1\n', 'DATABASE_URL', 'u'), 'A=1\nDATABASE_URL=u\n');
  assert.equal(setEnvValue('A=1', 'DATABASE_URL', 'u'), 'A=1\nDATABASE_URL=u\n');
  assert.equal(
    setEnvValue('# DATABASE_URL=x\nDATABASE_URL=old\nB=2\n', 'DATABASE_URL', 'new$1'),
    '# DATABASE_URL=x\nDATABASE_URL=new$1\nB=2\n',
  );
  assert.equal(readEnvValue('A=1\nDATABASE_URL="u"\n', 'DATABASE_URL'), 'u');
  assert.equal(readEnvValue('# DATABASE_URL=u\n', 'DATABASE_URL'), undefined);
});

const admin = process.env.TEST_DATABASE_URL;
test(
  'creates the database, writes DATABASE_URL and is idempotent',
  { skip: admin ? false : 'TEST_DATABASE_URL is not set' },
  async (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'dev-db-'));
    const repo = path.join(root, 'Setup Test Checkout');
    mkdirSync(repo);
    writeFileSync(path.join(repo, '.env'), 'A=1\n');
    const env = { DEV_POSTGRES_URL: admin };
    const name = databaseNameFor('Setup Test Checkout');
    t.after(async () => {
      rmSync(root, { recursive: true, force: true });
      const client = new pg.Client({ connectionString: admin });
      await client.connect();
      await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await client.end();
    });
    const logs = [];
    const first = await ensureDevDatabase({ repoRoot: repo, env, log: (line) => logs.push(line) });
    assert.equal(first.name, name);
    assert.match(logs.join('\n'), /Created database/);
    assert.equal(readEnvValue(readFileSync(path.join(repo, '.env'), 'utf8'), 'DATABASE_URL'), first.url);
    const second = await ensureDevDatabase({ repoRoot: repo, env, log: (line) => logs.push(line) });
    assert.equal(second.url, first.url);
    assert.match(logs.at(-1), /exists/);
    const client = new pg.Client({ connectionString: first.url });
    await client.connect();
    await client.end();
  },
);
