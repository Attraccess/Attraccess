#!/usr/bin/env node
// Seeds local development data directly after migrations have created the SQLite schema.
// Usage: pnpm seed:dev -- [--demo] [--fixture path/to/fixture.json] [--username admin] [--password password]
import sqlite3pkg from 'sqlite3';
import bcrypt from 'bcrypt';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, realpathSync } from 'node:fs';

const sqlite3 = sqlite3pkg.verbose();

const DEMO_FIXTURE = {
  resourceGroups: [{ name: 'Demo Workshop', description: 'Resources used for local development.' }],
  resources: [
    {
      name: 'Demo 3D Printer',
      type: 'machine',
      description: 'A safe local-development resource.',
      groups: ['Demo Workshop'],
    },
  ],
  roles: [
    {
      key: 'demo-resource-user',
      name: 'Demo Resource User',
      description: 'Can view the local demo resource.',
      permissions: ['resources.read'],
    },
  ],
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
  }
  return out;
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function callback(error) {
      if (error) reject(error);
      else resolve(this);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row)));
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
  });
}

async function hasTable(db, table) {
  return Boolean(await get(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]));
}

async function getColumns(db, table) {
  return (await all(db, `PRAGMA table_info("${table}")`)).map((row) => row.name);
}

function localDatabasePath(repoRoot, requestedPath) {
  const storageDir = path.resolve(repoRoot, 'storage');
  const dbPath = path.resolve(requestedPath || path.join(storageDir, 'attraccess.sqlite'));
  return { dbPath, isLocal: dbPath === storageDir || dbPath.startsWith(`${storageDir}${path.sep}`) };
}

function loadFixture(fixturePath) {
  try {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) {
      throw new Error('fixture must be a JSON object');
    }
    return fixture;
  } catch (error) {
    throw new Error(`Could not read fixture ${fixturePath}: ${error.message}`);
  }
}

async function upsertAdmin(db, { username, email, password }) {
  const userColumns = await getColumns(db, 'user');
  if (userColumns.length === 0) throw new Error('user table missing - start the API so migrations run');

  const byLowercaseName = new Map(userColumns.map((column) => [column.toLowerCase(), column]));
  const userId = (await get(db, 'SELECT id FROM "user" WHERE username = ? OR email = ?', [username, email]))?.id;
  const writableValues = {
    username,
    email,
    isEmailVerified: 1,
    isDisabled: 0,
    failedLoginAttempts: 0,
    firstFailedLoginAt: null,
    lockedUntil: null,
  };
  const fields = Object.entries(writableValues)
    .map(([name, value]) => [byLowercaseName.get(name.toLowerCase()), value])
    .filter(([column]) => column);

  let seededUserId = userId;
  if (seededUserId) {
    await run(db, `UPDATE "user" SET ${fields.map(([column]) => `"${column}" = ?`).join(', ')} WHERE id = ?`, [
      ...fields.map(([, value]) => value),
      seededUserId,
    ]);
  } else {
    const result = await run(
      db,
      `INSERT INTO "user" (${fields.map(([column]) => `"${column}"`).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
      fields.map(([, value]) => value),
    );
    seededUserId = result.lastID;
  }

  if (!(await hasTable(db, 'authentication_detail'))) {
    throw new Error('authentication_detail table missing - start the API so migrations run');
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const authentication = await get(
    db,
    "SELECT id FROM authentication_detail WHERE userId = ? AND type = 'local_password'",
    [seededUserId],
  );
  if (authentication) {
    await run(db, 'UPDATE authentication_detail SET password = ? WHERE id = ?', [passwordHash, authentication.id]);
  } else {
    await run(db, "INSERT INTO authentication_detail (userId, type, password) VALUES (?, 'local_password', ?)", [
      seededUserId,
      passwordHash,
    ]);
  }
  return seededUserId;
}

async function assignRole(db, username, roleKey) {
  const user = await get(db, 'SELECT id FROM "user" WHERE username = ?', [username]);
  const role = await get(db, 'SELECT id FROM "role" WHERE key = ?', [roleKey]);
  if (!user) throw new Error(`Fixture user not found: ${username}`);
  if (!role) throw new Error(`Fixture role not found: ${roleKey}`);
  const assignment = await get(db, "SELECT id FROM user_role WHERE userId = ? AND roleId = ? AND source = 'manual'", [
    user.id,
    role.id,
  ]);
  if (!assignment) {
    await run(db, "INSERT INTO user_role (userId, roleId, source) VALUES (?, ?, 'manual')", [user.id, role.id]);
  }
}

async function applyFixture(db, fixture) {
  for (const group of fixture.resourceGroups ?? []) {
    if (!group.name) throw new Error('Every resource group requires a name');
    const existing = await get(db, 'SELECT id FROM resource_group WHERE name = ?', [group.name]);
    if (existing) {
      if (Object.hasOwn(group, 'description')) {
        await run(db, 'UPDATE resource_group SET description = ? WHERE id = ?', [group.description, existing.id]);
      }
    } else {
      await run(db, 'INSERT INTO resource_group (name, description) VALUES (?, ?)', [
        group.name,
        group.description ?? null,
      ]);
    }
  }

  for (const resource of fixture.resources ?? []) {
    if (!resource.name || !['machine', 'door'].includes(resource.type)) {
      throw new Error('Every resource requires a name and a type of machine or door');
    }
    const existing = await get(db, 'SELECT id FROM resource WHERE name = ? AND deletedAt IS NULL', [resource.name]);
    let resourceId = existing?.id;
    if (resourceId) {
      if (Object.hasOwn(resource, 'description')) {
        await run(db, 'UPDATE resource SET type = ?, description = ? WHERE id = ?', [
          resource.type,
          resource.description,
          resourceId,
        ]);
      } else {
        await run(db, 'UPDATE resource SET type = ? WHERE id = ?', [resource.type, resourceId]);
      }
    } else {
      const result = await run(db, 'INSERT INTO resource (name, type, description) VALUES (?, ?, ?)', [
        resource.name,
        resource.type,
        resource.description ?? null,
      ]);
      resourceId = result.lastID;
    }
    for (const groupName of resource.groups ?? []) {
      const group = await get(db, 'SELECT id FROM resource_group WHERE name = ?', [groupName]);
      if (!group) throw new Error(`Resource group not found: ${groupName}`);
      await run(
        db,
        'INSERT OR IGNORE INTO resource_groups_resource_group (resourceId, resourceGroupId) VALUES (?, ?)',
        [resourceId, group.id],
      );
    }
  }

  for (const role of fixture.roles ?? []) {
    if (!role.key || !role.name || !Array.isArray(role.permissions)) {
      throw new Error('Every role requires key, name, and permissions');
    }
    const unknownPermissions = [];
    for (const permissionKey of role.permissions) {
      if (!(await get(db, 'SELECT key FROM permission WHERE key = ?', [permissionKey])))
        unknownPermissions.push(permissionKey);
    }
    if (unknownPermissions.length) throw new Error(`Unknown permission keys: ${unknownPermissions.join(', ')}`);
    const existing = await get(db, 'SELECT id, isSystemManaged FROM "role" WHERE key = ?', [role.key]);
    let roleId = existing?.id;
    if (roleId) {
      if (existing.isSystemManaged) throw new Error(`Fixture cannot modify system-managed role: ${role.key}`);
      if (Object.hasOwn(role, 'description')) {
        await run(db, 'UPDATE "role" SET name = ?, description = ? WHERE id = ?', [
          role.name,
          role.description,
          roleId,
        ]);
      } else {
        await run(db, 'UPDATE "role" SET name = ? WHERE id = ?', [role.name, roleId]);
      }
    } else {
      const result = await run(
        db,
        'INSERT INTO "role" (key, name, description, isSystemManaged, isDefault) VALUES (?, ?, ?, 0, 0)',
        [role.key, role.name, role.description ?? ''],
      );
      roleId = result.lastID;
    }
    for (const permissionKey of role.permissions) {
      const grant = await get(db, 'SELECT id FROM role_permission WHERE roleId = ? AND permissionKey = ?', [
        roleId,
        permissionKey,
      ]);
      if (!grant)
        await run(db, 'INSERT INTO role_permission (roleId, permissionKey) VALUES (?, ?)', [roleId, permissionKey]);
    }
  }

  for (const assignment of fixture.userRoles ?? []) {
    if (!assignment.username || !assignment.roleKey)
      throw new Error('Every user role assignment requires username and roleKey');
    await assignRole(db, assignment.username, assignment.roleKey);
  }
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const args = parseArgs(process.argv.slice(2));
  const { dbPath, isLocal } = localDatabasePath(repoRoot, args.db || process.env.SEED_DB_PATH);
  if (!isLocal && !args['allow-external-db']) {
    throw new Error(
      'Refusing to seed a database outside storage/. Use --allow-external-db only for an isolated local database.',
    );
  }
  if (!existsSync(dbPath)) throw new Error(`DB not found at ${dbPath}. Start the API once so migrations create it.`);
  if (isLocal) {
    const storageDir = realpathSync(path.resolve(repoRoot, 'storage'));
    const resolvedDbPath = realpathSync(dbPath);
    if (resolvedDbPath !== storageDir && !resolvedDbPath.startsWith(`${storageDir}${path.sep}`)) {
      throw new Error('Refusing to follow a database symlink outside storage/.');
    }
  }

  const username = String(args.username || 'admin').toLowerCase();
  const email = String(args.email || 'admin@local');
  const password = String(args.password || 'password');
  const fixture = args.fixture ? loadFixture(path.resolve(String(args.fixture))) : null;
  const db = new sqlite3.Database(dbPath);
  try {
    await run(db, 'BEGIN');
    const rbacTables = ['role', 'permission', 'role_permission', 'user_role'];
    if (!(await Promise.all(rbacTables.map((table) => hasTable(db, table)))).every(Boolean)) {
      throw new Error('RBAC tables are missing - start the API with the latest migrations before seeding');
    }
    const userId = await upsertAdmin(db, { username, email, password });
    await assignRole(db, username, 'administrator');
    if (args.demo) {
      await applyFixture(db, DEMO_FIXTURE);
      await assignRole(db, username, 'demo-resource-user');
    }
    if (fixture) await applyFixture(db, fixture);
    await run(db, 'COMMIT');
    console.log(`Seeded local admin user id=${userId}`);
    console.log(`  username: ${username}`);
    console.log(`  password: ${password}`);
    console.log(`  email:    ${email}`);
    if (args.demo) console.log('  demo fixture: applied');
    if (fixture) console.log(`  fixture: applied from ${args.fixture}`);
  } catch (error) {
    await run(db, 'ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
