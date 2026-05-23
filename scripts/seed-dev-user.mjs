#!/usr/bin/env node
// Seeds a known dev admin into storage/attraccess.sqlite. Idempotent: upserts.
// Usage: node scripts/seed-dev-user.mjs [--db <path>] [--username devadmin] [--password Devadmin1!] [--email dev@local]
import sqlite3pkg from 'sqlite3';
import bcrypt from 'bcrypt';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const sqlite3 = sqlite3pkg.verbose();

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function cb(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function getColumns(db, table) {
  const rows = await all(db, `PRAGMA table_info(${table})`);
  return rows.map((r) => r.name);
}

async function findPermissionColumns(userCols) {
  const lookup = new Map(userCols.map((c) => [c.toLowerCase(), c]));
  const findOne = (...candidates) => {
    for (const c of candidates) {
      const hit = lookup.get(c.toLowerCase());
      if (hit) return hit;
    }
    return null;
  };
  return {
    canManageResources: findOne('canManageResources', 'systemPermissionsCanManageResources', 'systemPermissionsCanmanageresources'),
    canManageSystemConfiguration: findOne('canManageSystemConfiguration', 'systemPermissionsCanManageSystemConfiguration', 'systemPermissionsCanmanagesystemconfiguration'),
    canManageUsers: findOne('canManageUsers', 'systemPermissionsCanManageUsers', 'systemPermissionsCanmanageusers'),
    canManageBilling: findOne('canManageBilling', 'systemPermissionsCanManageBilling', 'systemPermissionsCanmanagebilling'),
  };
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(__filename), '..');
  const args = parseArgs(process.argv.slice(2));
  const dbPath = path.resolve(args.db || process.env.SEED_DB_PATH || path.join(repoRoot, 'storage', 'attraccess.sqlite'));
  const username = (args.username || 'devadmin').toLowerCase();
  const email = args.email || 'dev@local';
  const password = args.password || 'Devadmin1!';

  if (!existsSync(dbPath)) {
    console.error(`DB not found at ${dbPath}. Start the API once so migrations create it.`);
    process.exit(1);
  }
  console.log(`Seeding ${username} into ${dbPath}`);

  const db = new sqlite3.Database(dbPath);

  const userCols = await getColumns(db, 'user');
  if (userCols.length === 0) {
    throw new Error('user table missing - run migrations first');
  }
  const permCols = await findPermissionColumns(userCols);
  const missingPerms = Object.entries(permCols).filter(([, v]) => !v).map(([k]) => k);
  if (missingPerms.length) {
    console.warn(`Note: missing permission columns in this schema: ${missingPerms.join(', ')}`);
  }
  const hasEmailVerified = userCols.some((c) => c.toLowerCase() === 'isemailverified');

  const passwordHash = await bcrypt.hash(password, 10);

  await run(db, 'BEGIN');
  try {
    const existing = await get(db, 'SELECT id FROM "user" WHERE username = ? OR email = ?', [username, email]);
    let userId;
    if (existing) {
      userId = existing.id;
      const updates = ['username = ?', 'email = ?'];
      const values = [username, email];
      if (hasEmailVerified) {
        updates.push('isEmailVerified = 1');
      }
      for (const col of Object.values(permCols)) {
        if (col) {
          updates.push(`"${col}" = 1`);
        }
      }
      values.push(userId);
      await run(db, `UPDATE "user" SET ${updates.join(', ')} WHERE id = ?`, values);
      console.log(`Updated existing user id=${userId}`);
    } else {
      const insertCols = ['username', 'email'];
      const insertVals = [username, email];
      if (hasEmailVerified) {
        insertCols.push('isEmailVerified');
        insertVals.push(1);
      }
      for (const col of Object.values(permCols)) {
        if (col) {
          insertCols.push(`"${col}"`);
          insertVals.push(1);
        }
      }
      const placeholders = insertVals.map(() => '?').join(', ');
      const result = await run(db, `INSERT INTO "user" (${insertCols.join(', ')}) VALUES (${placeholders})`, insertVals);
      userId = result.lastID;
      console.log(`Inserted new user id=${userId}`);
    }

    const authCols = await getColumns(db, 'authentication_detail');
    const hasPassword = authCols.some((c) => c.toLowerCase() === 'password');
    if (!hasPassword) {
      throw new Error('authentication_detail.password column missing');
    }
    const existingAuth = await get(
      db,
      "SELECT id FROM authentication_detail WHERE userId = ? AND type = 'local_password'",
      [userId],
    );
    if (existingAuth) {
      await run(db, 'UPDATE authentication_detail SET password = ? WHERE id = ?', [passwordHash, existingAuth.id]);
      console.log('Updated existing local_password authentication_detail');
    } else {
      await run(
        db,
        "INSERT INTO authentication_detail (userId, type, password) VALUES (?, 'local_password', ?)",
        [userId, passwordHash],
      );
      console.log('Inserted local_password authentication_detail');
    }

    await run(db, 'COMMIT');
    console.log('\nSeed complete.');
    console.log(`  username: ${username}`);
    console.log(`  password: ${password}`);
    console.log(`  email:    ${email}`);
  } catch (err) {
    await run(db, 'ROLLBACK');
    throw err;
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
