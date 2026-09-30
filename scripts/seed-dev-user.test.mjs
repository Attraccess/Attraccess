import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';

const script = path.resolve('scripts/seed-dev-user.mjs');
const execute = (db, sql) =>
  new Promise((resolve, reject) => db.exec(sql, (error) => (error ? reject(error) : resolve())));
const rows = (db, sql) =>
  new Promise((resolve, reject) => db.all(sql, (error, values) => (error ? reject(error) : resolve(values))));
const close = (db) => new Promise((resolve, reject) => db.close((error) => (error ? reject(error) : resolve())));

async function database() {
  const directory = mkdtempSync(path.join(tmpdir(), 'attraccess-seed-test-'));
  const file = path.join(directory, 'test.sqlite');
  const db = new sqlite3.Database(file);
  await execute(
    db,
    `
    CREATE TABLE user (id INTEGER PRIMARY KEY, username TEXT UNIQUE, email TEXT UNIQUE, isEmailVerified INTEGER, isDisabled INTEGER, failedLoginAttempts INTEGER, firstFailedLoginAt TEXT, lockedUntil TEXT);
    CREATE TABLE authentication_detail (id INTEGER PRIMARY KEY, userId INTEGER, type TEXT, password TEXT);
    CREATE TABLE role (id INTEGER PRIMARY KEY, key TEXT UNIQUE, name TEXT, description TEXT, isSystemManaged INTEGER, isDefault INTEGER);
    CREATE TABLE permission (key TEXT PRIMARY KEY);
    CREATE TABLE role_permission (id INTEGER PRIMARY KEY, roleId INTEGER, permissionKey TEXT);
    CREATE TABLE user_role (id INTEGER PRIMARY KEY, userId INTEGER, roleId INTEGER, source TEXT);
    CREATE TABLE resource_group (id INTEGER PRIMARY KEY, name TEXT UNIQUE, description TEXT);
    CREATE TABLE resource (id INTEGER PRIMARY KEY, name TEXT, type TEXT, description TEXT, deletedAt TEXT);
    CREATE TABLE resource_groups_resource_group (resourceId INTEGER, resourceGroupId INTEGER, UNIQUE(resourceId, resourceGroupId));
    INSERT INTO role VALUES (1, 'administrator', 'Admin', '', 1, 0);
    INSERT INTO permission VALUES ('resources.read');
  `,
  );
  return { directory, file, db };
}

function run(file, args = []) {
  return execFileSync(
    process.execPath,
    [
      script,
      '--db',
      file,
      '--allow-external-db',
      '--username',
      'TEST-ADMIN',
      '--password',
      'fixture-password',
      ...args,
    ],
    { encoding: 'utf8' },
  );
}

test('seeds a local administrator and idempotent demo fixture with a hashed password', async () => {
  const { directory, file, db } = await database();
  try {
    run(file, ['--demo']);
    run(file, ['--demo']);
    const users = await rows(db, 'SELECT * FROM user');
    assert.equal(users.length, 1);
    assert.equal(users[0].username, 'test-admin');
    assert.equal(users[0].isEmailVerified, 1);
    const auth = await rows(db, 'SELECT * FROM authentication_detail');
    assert.equal(auth.length, 1);
    assert.ok(await bcrypt.compare('fixture-password', auth[0].password));
    assert.equal((await rows(db, 'SELECT * FROM user_role')).length, 2);
    assert.equal((await rows(db, 'SELECT * FROM resource_groups_resource_group')).length, 1);
    assert.equal((await rows(db, 'SELECT * FROM resource')).length, 1);
  } finally {
    await close(db);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('updates fixture fields without duplicating grants or touching omitted descriptions', async () => {
  const { directory, file, db } = await database();
  const fixture = path.join(directory, 'fixture.json');
  try {
    run(file, ['--demo']);
    const contents = {
      resourceGroups: [{ name: 'Demo Workshop', description: 'Changed group' }],
      resources: [
        { name: 'Demo 3D Printer', type: 'door', description: 'Changed resource', groups: ['Demo Workshop'] },
      ],
      roles: [
        {
          key: 'demo-resource-user',
          name: 'Changed role',
          description: 'Changed role description',
          permissions: ['resources.read'],
        },
      ],
      userRoles: [{ username: 'test-admin', roleKey: 'demo-resource-user' }],
    };
    writeFileSync(fixture, JSON.stringify(contents));
    run(file, ['--fixture', fixture]);
    delete contents.resources[0].description;
    delete contents.roles[0].description;
    delete contents.resourceGroups[0].description;
    writeFileSync(fixture, JSON.stringify(contents));
    run(file, ['--fixture', fixture]);
    assert.deepEqual(await rows(db, 'SELECT name, type, description FROM resource'), [
      { name: 'Demo 3D Printer', type: 'door', description: 'Changed resource' },
    ]);
    assert.deepEqual(await rows(db, "SELECT name, description FROM role WHERE key = 'demo-resource-user'"), [
      { name: 'Changed role', description: 'Changed role description' },
    ]);
    assert.equal((await rows(db, 'SELECT * FROM role_permission')).length, 1);
    assert.equal((await rows(db, 'SELECT * FROM user_role')).length, 2);
  } finally {
    await close(db);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rolls back the whole seed transaction when a fixture requests unknown permissions', async () => {
  const { directory, file, db } = await database();
  try {
    const fixture = path.join(directory, 'bad.json');
    writeFileSync(fixture, JSON.stringify({ roles: [{ key: 'invalid', name: 'Invalid', permissions: ['unknown'] }] }));
    const result = spawnSync(process.execPath, [script, '--db', file, '--allow-external-db', '--fixture', fixture], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown permission keys: unknown/);
    assert.equal((await rows(db, 'SELECT * FROM user')).length, 0);
    assert.equal((await rows(db, 'SELECT * FROM authentication_detail')).length, 0);
  } finally {
    await close(db);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('refuses external databases without an explicit isolated-database override', () => {
  const result = spawnSync(process.execPath, [script, '--db', path.join(tmpdir(), 'not-authorized.sqlite')], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to seed a database outside storage/);
});
