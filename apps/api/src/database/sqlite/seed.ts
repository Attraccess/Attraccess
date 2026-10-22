import sqlite3 from 'sqlite3';
import type { Database, RunResult } from 'sqlite3';
import bcrypt from 'bcrypt';
import type { DevelopmentSeedData, SeedFixture } from '../tooling';

function run(db: Database, sql: string, params: unknown[] = []): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function callback(error) {
      if (error) reject(error);
      else resolve(this);
    });
  });
}

function get<T = { id: number; isSystemManaged?: boolean }>(
  db: Database,
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get<T>(sql, params, (error, row) => (error ? reject(error) : resolve(row)));
  });
}

function all<T = { name: string }>(db: Database, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all<T>(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
  });
}

async function hasTable(db: Database, table: string): Promise<boolean> {
  return Boolean(await get(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]));
}

async function getColumns(db: Database, table: string): Promise<string[]> {
  return (await all(db, `PRAGMA table_info("${table}")`)).map((row) => row.name);
}

async function upsertAdmin(db: Database, { username, email, password }: DevelopmentSeedData['admin']): Promise<number> {
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

async function assignRole(db: Database, username: string, roleKey: string): Promise<void> {
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

const DEMO_FIXTURE: SeedFixture = {
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

async function applyFixture(db: Database, fixture: SeedFixture): Promise<void> {
  await applyResourceGroups(db, fixture.resourceGroups ?? []);
  await applyResources(db, fixture.resources ?? []);
  await applyRoles(db, fixture.roles ?? []);
  for (const assignment of fixture.userRoles ?? []) {
    if (!assignment.username || !assignment.roleKey)
      throw new Error('Every user role assignment requires username and roleKey');
    await assignRole(db, assignment.username, assignment.roleKey);
  }
}

async function applyResourceGroups(db: Database, entries: NonNullable<SeedFixture['resourceGroups']>): Promise<void> {
  for (const group of entries) {
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
}

async function applyResources(db: Database, entries: NonNullable<SeedFixture['resources']>): Promise<void> {
  for (const resource of entries) {
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
}

async function applyRoles(db: Database, entries: NonNullable<SeedFixture['roles']>): Promise<void> {
  for (const role of entries) {
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
}

/** Validate direct seed/import writes before committing; never repair them implicitly. */
async function assertUsageIntegrity(db: Database): Promise<void> {
  const all = (sql: string): Promise<unknown[]> =>
    new Promise((resolve, reject) => db.all(sql, (error, rows) => (error ? reject(error) : resolve(rows))));
  const tables = await all("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'resource_usage'");
  if (tables.length === 0) return;
  const invalid = await all(`SELECT id FROM resource_usage
    WHERE endTime IS NULL AND isFinalized = 0 AND lifecyclePending = 0`);
  const duplicate = await all(`SELECT resourceId FROM resource_usage
    WHERE usageAction = 'usage' AND endTime IS NULL AND isFinalized = 1 AND lifecyclePending = 0
    GROUP BY resourceId HAVING COUNT(*) > 1`);
  const duplicatePending = await all(`SELECT resourceId FROM resource_usage
    WHERE endTime IS NULL AND lifecyclePending = 1
    GROUP BY resourceId HAVING COUNT(*) > 1`);
  const unreserved = await all(`SELECT u.id FROM resource_usage u WHERE u.lifecyclePending = 1 AND NOT EXISTS (
    SELECT 1 FROM resource_usage_lifecycle_attempt a WHERE a.resourceId = u.resourceId AND (
      (a.kind IN ('start', 'takeover') AND a.candidateUsageId = u.id)
      OR (a.kind = 'end' AND a.previousUsageId = u.id)))`);
  if (invalid.length || duplicate.length || duplicatePending.length || unreserved.length) {
    throw new Error(
      `Invalid usage lifecycle state after seed/import: orphans=${invalid.length}, duplicate active resources=${duplicate.length}, duplicate pending resources=${duplicatePending.length}, unreserved candidates=${unreserved.length}`,
    );
  }
}

async function openDatabase(database: string): Promise<Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(database, sqlite3.OPEN_READWRITE, (error) => (error ? reject(error) : resolve(db)));
  });
}
async function close(db: Database): Promise<void> {
  await new Promise<void>((resolve, reject) => db.close((error) => (error ? reject(error) : resolve())));
}

/** One database phase, no callback replay. Failure preserves all pre-existing installation data. */
export async function seedSQLiteDevelopmentData(
  database: string,
  input: DevelopmentSeedData,
): Promise<{ userId: number }> {
  const db = await openDatabase(database);
  let transactionStarted = false;
  try {
    await run(db, 'BEGIN');
    transactionStarted = true;
    const rbacTables = ['role', 'permission', 'role_permission', 'user_role'];
    if (!(await Promise.all(rbacTables.map((table) => hasTable(db, table)))).every(Boolean)) {
      throw new Error('RBAC tables are missing - start the API with the latest migrations before seeding');
    }
    const userId = await upsertAdmin(db, input.admin);
    await assignRole(db, input.admin.username, 'administrator');
    if (input.demo) {
      await applyFixture(db, DEMO_FIXTURE);
      await assignRole(db, input.admin.username, 'demo-resource-user');
    }
    if (input.fixture) await applyFixture(db, input.fixture);
    await assertUsageIntegrity(db);
    await run(db, 'COMMIT');
    transactionStarted = false;
    return { userId };
  } catch (error) {
    if (transactionStarted) await run(db, 'ROLLBACK');
    throw error;
  } finally {
    await close(db);
  }
}

export async function checkSQLiteUsageIntegrity(database: string): Promise<void> {
  const db = await openDatabase(database);
  try {
    await assertUsageIntegrity(db);
  } finally {
    await close(db);
  }
}
