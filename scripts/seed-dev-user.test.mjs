import { script, execute, rows, close, database } from './seed-dev-user.test-fixture.mjs';
import { registerExternalDatabaseRefusal } from './seed-dev-user-external.test-fixture.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';

test('rolls back a seed when legacy usage corruption is detected', async () => {
  const { directory, file, db } = await database();
  try {
    await execute(
      db,
      `INSERT INTO resource_usage (id, resourceId, userId, usageAction, startTime)
      VALUES (1, 1, 1, 'usage', datetime('now'))`,
    );
    const result = spawnSync(process.execPath, [script, '--db', file, '--allow-external-db'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid usage lifecycle state after seed\/import: orphans=1/);
    assert.deepEqual(await rows(db, 'SELECT * FROM user'), []);
    assert.equal((await rows(db, 'SELECT * FROM resource_usage')).length, 1);
  } finally {
    await close(db);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('accepts published sessions and pending candidates with a matching reservation', async () => {
  const { directory, file, db } = await database();
  try {
    await execute(
      db,
      `INSERT INTO resource_usage (id, resourceId, userId, usageAction, startTime, isFinalized, lifecyclePending)
      VALUES (1, 1, 1, 'usage', datetime('now'), 1, 0), (2, 1, 1, 'usage', datetime('now'), 0, 1);
      INSERT INTO resource_usage_lifecycle_attempt VALUES ('takeover', 1, 'takeover', 2, 1)`,
    );
    run(file);
    assert.equal((await rows(db, 'SELECT * FROM resource_usage')).length, 2);
  } finally {
    await close(db);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('accepts a pending start candidate with a matching reservation', async () => {
  const { directory, file, db } = await database();
  try {
    await execute(
      db,
      `INSERT INTO resource_usage (id, resourceId, userId, usageAction, startTime, isFinalized, lifecyclePending)
      VALUES (1, 1, 1, 'usage', datetime('now'), 0, 1);
      INSERT INTO resource_usage_lifecycle_attempt VALUES ('start', 1, 'start', 1, NULL)`,
    );
    const usages = await rows(db, 'SELECT * FROM resource_usage');
    const attempts = await rows(db, 'SELECT * FROM resource_usage_lifecycle_attempt');
    run(file);
    assert.deepEqual(await rows(db, 'SELECT * FROM resource_usage'), usages);
    assert.deepEqual(await rows(db, 'SELECT * FROM resource_usage_lifecycle_attempt'), attempts);
  } finally {
    await close(db);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('accepts a pending end usage owned by the reservation through previousUsageId', async () => {
  const { directory, file, db } = await database();
  try {
    await execute(
      db,
      `INSERT INTO resource_usage (id, resourceId, userId, usageAction, startTime, isFinalized, lifecyclePending)
      VALUES (1, 1, 1, 'usage', datetime('now'), 1, 1);
      INSERT INTO resource_usage_lifecycle_attempt VALUES ('end', 1, 'end', NULL, 1)`,
    );
    const usages = await rows(db, 'SELECT * FROM resource_usage');
    const attempts = await rows(db, 'SELECT * FROM resource_usage_lifecycle_attempt');
    run(file);
    assert.deepEqual(await rows(db, 'SELECT * FROM resource_usage'), usages);
    assert.deepEqual(await rows(db, 'SELECT * FROM resource_usage_lifecycle_attempt'), attempts);
  } finally {
    await close(db);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rolls back a seed with duplicate open pending usages even when both have reservations', async () => {
  const { directory, file, db } = await database();
  try {
    await execute(
      db,
      `INSERT INTO resource_usage (id, resourceId, userId, usageAction, startTime, isFinalized, lifecyclePending)
      VALUES (1, 1, 1, 'usage', datetime('now'), 0, 1), (2, 1, 1, 'usage', datetime('now'), 0, 1);
      INSERT INTO resource_usage_lifecycle_attempt VALUES
        ('start-1', 1, 'start', 1, NULL), ('start-2', 1, 'start', 2, NULL)`,
    );
    const usages = await rows(db, 'SELECT * FROM resource_usage');
    const attempts = await rows(db, 'SELECT * FROM resource_usage_lifecycle_attempt');
    const result = spawnSync(process.execPath, [script, '--db', file, '--allow-external-db', '--demo'], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /duplicate pending resources=1/);
    assert.match(result.stderr, /unreserved candidates=0/);
    for (const table of ['user', 'authentication_detail', 'user_role', 'resource', 'resource_group']) {
      assert.deepEqual(await rows(db, `SELECT * FROM ${table}`), []);
    }
    assert.deepEqual(await rows(db, 'SELECT * FROM resource_usage'), usages);
    assert.deepEqual(await rows(db, 'SELECT * FROM resource_usage_lifecycle_attempt'), attempts);
  } finally {
    await close(db);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('accepts pending reservations on different resources and closed pending history', async () => {
  const { directory, file, db } = await database();
  try {
    await execute(
      db,
      `INSERT INTO resource_usage (id, resourceId, userId, usageAction, startTime, endTime, isFinalized, lifecyclePending)
      VALUES (1, 1, 1, 'usage', datetime('now'), NULL, 0, 1),
        (2, 2, 1, 'usage', datetime('now'), NULL, 0, 1),
        (3, 1, 1, 'usage', datetime('now'), datetime('now'), 1, 1);
      INSERT INTO resource_usage_lifecycle_attempt VALUES
        ('start-1', 1, 'start', 1, NULL), ('start-2', 2, 'start', 2, NULL), ('end', 1, 'end', NULL, 3)`,
    );
    const usages = await rows(db, 'SELECT * FROM resource_usage');
    const attempts = await rows(db, 'SELECT * FROM resource_usage_lifecycle_attempt');
    run(file);
    assert.deepEqual(await rows(db, 'SELECT * FROM resource_usage'), usages);
    assert.deepEqual(await rows(db, 'SELECT * FROM resource_usage_lifecycle_attempt'), attempts);
  } finally {
    await close(db);
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const [name, reservation] of [
  ['missing reservation', ''],
  ['end candidate reference', "INSERT INTO resource_usage_lifecycle_attempt VALUES ('end', 1, 'end', 1, NULL)"],
  ['start previous reference', "INSERT INTO resource_usage_lifecycle_attempt VALUES ('start', 1, 'start', NULL, 1)"],
  [
    'takeover previous reference',
    "INSERT INTO resource_usage_lifecycle_attempt VALUES ('takeover', 1, 'takeover', 2, 1)",
  ],
  ['different resource', "INSERT INTO resource_usage_lifecycle_attempt VALUES ('end', 2, 'end', NULL, 1)"],
]) {
  test(`rolls back a seed with an unreserved pending usage: ${name}`, async () => {
    const { directory, file, db } = await database();
    try {
      await execute(
        db,
        `INSERT INTO resource_usage (id, resourceId, userId, usageAction, startTime, isFinalized, lifecyclePending)
        VALUES (1, 1, 1, 'usage', datetime('now'), 1, 1);
        ${reservation}`,
      );
      const usages = await rows(db, 'SELECT * FROM resource_usage');
      const attempts = await rows(db, 'SELECT * FROM resource_usage_lifecycle_attempt');
      const result = spawnSync(process.execPath, [script, '--db', file, '--allow-external-db'], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /unreserved candidates=1/);
      assert.deepEqual(await rows(db, 'SELECT * FROM user'), []);
      assert.deepEqual(await rows(db, 'SELECT * FROM resource_usage'), usages);
      assert.deepEqual(await rows(db, 'SELECT * FROM resource_usage_lifecycle_attempt'), attempts);
    } finally {
      await close(db);
      rmSync(directory, { recursive: true, force: true });
    }
  });
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

registerExternalDatabaseRefusal(script);
