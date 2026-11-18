import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import bcrypt from 'bcrypt';
import { createTestDatabase, skipWithoutPostgres } from './lib/test-postgres.mjs';

const script = path.resolve('apps/api/scripts/seed-dev-user.mjs');

const SCHEMA = `
  CREATE TABLE "user" (id SERIAL PRIMARY KEY, username text UNIQUE, email text UNIQUE, "isEmailVerified" boolean, "isDisabled" boolean,
    "failedLoginAttempts" integer, "firstFailedLoginAt" timestamptz, "lockedUntil" timestamptz);
  CREATE TABLE authentication_detail (id SERIAL PRIMARY KEY, "userId" integer, type text, password text);
  CREATE TABLE role (id SERIAL PRIMARY KEY, key text UNIQUE, name text, description text, "isSystemManaged" boolean, "isDefault" boolean);
  CREATE TABLE permission (key text PRIMARY KEY);
  CREATE TABLE role_permission (id SERIAL PRIMARY KEY, "roleId" integer, "permissionKey" text);
  CREATE TABLE user_role (id SERIAL PRIMARY KEY, "userId" integer, "roleId" integer, source text);
  CREATE TABLE resource_group (id SERIAL PRIMARY KEY, name text UNIQUE, description text);
  CREATE TABLE resource (id SERIAL PRIMARY KEY, name text, type text, description text, "deletedAt" timestamptz);
  CREATE TABLE resource_groups_resource_group ("resourceId" integer, "resourceGroupId" integer, UNIQUE("resourceId", "resourceGroupId"));
  CREATE TABLE resource_usage (id SERIAL PRIMARY KEY, "resourceId" integer, "userId" integer, "usageAction" text,
    "startTime" timestamptz, "startNotes" text, "endTime" timestamptz, "isFinalized" boolean DEFAULT false, "lifecyclePending" boolean DEFAULT false);
  CREATE TABLE resource_usage_lifecycle_attempt (id text PRIMARY KEY, "resourceId" integer, kind text,
    "candidateUsageId" integer, "previousUsageId" integer);
  INSERT INTO role (key, name, description, "isSystemManaged", "isDefault") VALUES ('administrator', 'Admin', '', true, false);
  INSERT INTO permission VALUES ('resources.read');
`;

const rows = async (db, sql) => (await db.query(sql)).rows;

async function database() {
  const created = await createTestDatabase('attraccess_seed_test');
  await created.db.query(SCHEMA);
  const directory = mkdtempSync(path.join(tmpdir(), 'attraccess-seed-test-'));
  return {
    ...created,
    directory,
    async cleanup() {
      rmSync(directory, { recursive: true, force: true });
      await created.drop();
    },
  };
}

const cleanEnv = (extra = {}) => {
  const env = { ...process.env, ...extra };
  for (const name of ['DATABASE_URL', 'SEED_DATABASE_URL', 'DATABASE_TYPE', 'DATABASE_SCHEMA', 'DATABASE_SSL']) {
    if (!Object.hasOwn(extra, name)) delete env[name];
  }
  return env;
};

function seed(url, args = []) {
  return spawnSync(process.execPath, [script, '--db', url, ...args], { encoding: 'utf8', env: cleanEnv() });
}

function run(url, args = []) {
  const result = seed(url, [
    '--username',
    'test-admin',
    '--email',
    'test-admin@example.test',
    '--password',
    'fixture-password',
    ...args,
  ]);
  assert.equal(result.status, 0, result.stderr);
  return result;
}

const usage = (id, resourceId, finalized, pending, ended = 'NULL') =>
  `(${id}, ${resourceId}, 1, 'usage', now(), ${ended}, ${finalized}, ${pending})`;
const USAGE_COLUMNS = `INSERT INTO resource_usage (id, "resourceId", "userId", "usageAction", "startTime", "endTime", "isFinalized", "lifecyclePending") VALUES`;

async function assertSnapshotUnchanged(db, before) {
  assert.deepEqual(await rows(db, 'SELECT * FROM resource_usage ORDER BY id'), before.usages);
  assert.deepEqual(await rows(db, 'SELECT * FROM resource_usage_lifecycle_attempt ORDER BY id'), before.attempts);
}

async function snapshot(db) {
  return {
    usages: await rows(db, 'SELECT * FROM resource_usage ORDER BY id'),
    attempts: await rows(db, 'SELECT * FROM resource_usage_lifecycle_attempt ORDER BY id'),
  };
}

test('rolls back a seed when legacy usage corruption is detected', { skip: skipWithoutPostgres }, async () => {
  const { url, db, cleanup } = await database();
  try {
    await db.query(`${USAGE_COLUMNS} ${usage(1, 1, false, false)}`);
    const result = seed(url);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid usage lifecycle state after seed\/import: orphans=1/);
    assert.deepEqual(await rows(db, 'SELECT * FROM "user"'), []);
    assert.equal((await rows(db, 'SELECT * FROM resource_usage')).length, 1);
  } finally {
    await cleanup();
  }
});

test(
  'accepts published sessions and pending candidates with a matching reservation',
  { skip: skipWithoutPostgres },
  async () => {
    const { url, db, cleanup } = await database();
    try {
      await db.query(`${USAGE_COLUMNS} ${usage(1, 1, true, false)}, ${usage(2, 1, false, true)};
      INSERT INTO resource_usage_lifecycle_attempt VALUES ('takeover', 1, 'takeover', 2, 1)`);
      run(url);
      assert.equal((await rows(db, 'SELECT * FROM resource_usage')).length, 2);
    } finally {
      await cleanup();
    }
  },
);

test(
  'accepts a pending start candidate and a pending end usage with matching reservations',
  { skip: skipWithoutPostgres },
  async () => {
    for (const [usages, attempt] of [
      [usage(1, 1, false, true), "('start', 1, 'start', 1, NULL)"],
      [usage(1, 1, true, true), "('end', 1, 'end', NULL, 1)"],
    ]) {
      const { url, db, cleanup } = await database();
      try {
        await db.query(`${USAGE_COLUMNS} ${usages}; INSERT INTO resource_usage_lifecycle_attempt VALUES ${attempt}`);
        const before = await snapshot(db);
        run(url);
        await assertSnapshotUnchanged(db, before);
      } finally {
        await cleanup();
      }
    }
  },
);

test(
  'rolls back a seed with duplicate open pending usages even when both have reservations',
  { skip: skipWithoutPostgres },
  async () => {
    const { url, db, cleanup } = await database();
    try {
      await db.query(`${USAGE_COLUMNS} ${usage(1, 1, false, true)}, ${usage(2, 1, false, true)};
      INSERT INTO resource_usage_lifecycle_attempt VALUES
        ('start-1', 1, 'start', 1, NULL), ('start-2', 1, 'start', 2, NULL)`);
      const before = await snapshot(db);
      const result = seed(url, ['--demo']);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /duplicate pending resources=1/);
      assert.match(result.stderr, /unreserved candidates=0/);
      for (const table of ['"user"', 'authentication_detail', 'user_role', 'resource', 'resource_group']) {
        assert.deepEqual(await rows(db, `SELECT * FROM ${table}`), []);
      }
      await assertSnapshotUnchanged(db, before);
    } finally {
      await cleanup();
    }
  },
);

test(
  'accepts pending reservations on different resources and closed pending history',
  { skip: skipWithoutPostgres },
  async () => {
    const { url, db, cleanup } = await database();
    try {
      await db.query(`${USAGE_COLUMNS} ${usage(1, 1, false, true)}, ${usage(2, 2, false, true)}, ${usage(3, 1, true, true, 'now()')};
      INSERT INTO resource_usage_lifecycle_attempt VALUES
        ('start-1', 1, 'start', 1, NULL), ('start-2', 2, 'start', 2, NULL), ('end', 1, 'end', NULL, 3)`);
      const before = await snapshot(db);
      run(url);
      await assertSnapshotUnchanged(db, before);
    } finally {
      await cleanup();
    }
  },
);

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
  test(`rolls back a seed with an unreserved pending usage: ${name}`, { skip: skipWithoutPostgres }, async () => {
    const { url, db, cleanup } = await database();
    try {
      await db.query(`${USAGE_COLUMNS} ${usage(1, 1, true, true)}; ${reservation}`);
      const before = await snapshot(db);
      const result = seed(url);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /unreserved candidates=1/);
      assert.deepEqual(await rows(db, 'SELECT * FROM "user"'), []);
      await assertSnapshotUnchanged(db, before);
    } finally {
      await cleanup();
    }
  });
}

test(
  'seeds a local administrator and idempotent demo fixture with a hashed password',
  { skip: skipWithoutPostgres },
  async () => {
    const { url, db, cleanup } = await database();
    try {
      run(url, ['--demo']);
      run(url, ['--demo']);
      const users = await rows(db, 'SELECT * FROM "user"');
      assert.equal(users.length, 1);
      assert.equal(users[0].username, 'test-admin');
      assert.equal(users[0].isEmailVerified, true);
      const auth = await rows(db, 'SELECT * FROM authentication_detail');
      assert.equal(auth.length, 1);
      assert.ok(await bcrypt.compare('fixture-password', auth[0].password));
      assert.equal((await rows(db, 'SELECT * FROM user_role')).length, 2);
      assert.equal((await rows(db, 'SELECT * FROM resource_groups_resource_group')).length, 1);
      assert.equal((await rows(db, 'SELECT * FROM resource')).length, 1);
    } finally {
      await cleanup();
    }
  },
);

test(
  'updates fixture fields without duplicating grants or touching omitted descriptions',
  { skip: skipWithoutPostgres },
  async () => {
    const { url, db, directory, cleanup } = await database();
    const fixture = path.join(directory, 'fixture.json');
    try {
      run(url, ['--demo']);
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
      run(url, ['--fixture', fixture]);
      delete contents.resources[0].description;
      delete contents.roles[0].description;
      delete contents.resourceGroups[0].description;
      writeFileSync(fixture, JSON.stringify(contents));
      run(url, ['--fixture', fixture]);
      assert.deepEqual(await rows(db, 'SELECT name, type, description FROM resource'), [
        { name: 'Demo 3D Printer', type: 'door', description: 'Changed resource' },
      ]);
      assert.deepEqual(await rows(db, "SELECT name, description FROM role WHERE key = 'demo-resource-user'"), [
        { name: 'Changed role', description: 'Changed role description' },
      ]);
      assert.equal((await rows(db, 'SELECT * FROM role_permission')).length, 1);
      assert.equal((await rows(db, 'SELECT * FROM user_role')).length, 2);
    } finally {
      await cleanup();
    }
  },
);

test(
  'rolls back the whole seed transaction when a fixture requests unknown permissions',
  { skip: skipWithoutPostgres },
  async () => {
    const { url, db, directory, cleanup } = await database();
    try {
      const fixture = path.join(directory, 'bad.json');
      writeFileSync(
        fixture,
        JSON.stringify({ roles: [{ key: 'invalid', name: 'Invalid', permissions: ['unknown'] }] }),
      );
      const result = seed(url, ['--fixture', fixture]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Unknown permission keys: unknown/);
      assert.equal((await rows(db, 'SELECT * FROM "user"')).length, 0);
      assert.equal((await rows(db, 'SELECT * FROM authentication_detail')).length, 0);
    } finally {
      await cleanup();
    }
  },
);

test('refuses a database on another host without an explicit isolated-database override', () => {
  const result = seed('postgres://user:secret@db.example.test:5432/production');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to seed the database production on db\.example\.test/);
  assert.doesNotMatch(result.stderr, /secret/);
});

// Invoke the actual seed transaction with an isolated repository and .env.
function seedInRepository(repoRoot, args = [], extraEnv = {}) {
  const harness = `import { main } from ${JSON.stringify(script)};
    main(process.argv.slice(1), ${JSON.stringify(repoRoot)}).catch(error => {
      console.error(error.message); process.exitCode = 1;
    });`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', harness, ...args], {
    encoding: 'utf8',
    env: cleanEnv(extraEnv),
  });
}

test('loads DATABASE_URL from .env and seeds that database', { skip: skipWithoutPostgres }, async () => {
  const { url, db, directory, cleanup } = await database();
  try {
    writeFileSync(path.join(directory, '.env'), `DATABASE_URL=${url}\n`);
    const result = seedInRepository(directory);
    assert.equal(result.status, 0, result.stderr);
    assert.equal((await rows(db, 'SELECT * FROM "user"')).length, 1);
  } finally {
    await cleanup();
  }
});

test('process DATABASE_URL takes precedence over .env', { skip: skipWithoutPostgres }, async () => {
  const { url, db, directory, cleanup } = await database();
  try {
    writeFileSync(
      path.join(directory, '.env'),
      'DATABASE_URL=postgres://nobody:nothing@db.example.test:5432/missing\n',
    );
    const result = seedInRepository(directory, [], { DATABASE_URL: url });
    assert.equal(result.status, 0, result.stderr);
    assert.equal((await rows(db, 'SELECT * FROM "user"')).length, 1);
  } finally {
    await cleanup();
  }
});

test('requires DATABASE_URL when no database is named', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'attraccess-seed-test-'));
  try {
    mkdirSync(path.join(directory, 'empty'));
    const result = seedInRepository(path.join(directory, 'empty'));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /DATABASE_URL is required/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
