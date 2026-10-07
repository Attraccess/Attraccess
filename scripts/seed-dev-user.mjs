#!/usr/bin/env node
/* eslint-disable no-console -- Preserve operational diagnostics and CLI output. */
// Seeds local development data directly after migrations have created the SQLite schema.
// Usage: pnpm seed:dev -- [--demo] [--fixture path/to/fixture.json] [--username admin] [--password password]
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3pkg from 'sqlite3';
import { hasTable, run } from './seed-database.mjs';
import { applyFixture, DEMO_FIXTURE, loadFixture } from './seed-fixtures.mjs';
import { assertUsageIntegrity } from './usage-integrity.mjs';
import { assignRole, upsertAdmin } from './seed-users.mjs';

const sqlite3 = sqlite3pkg.verbose();

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

function localDatabasePath(repoRoot, requestedPath) {
  const storageDir = path.resolve(repoRoot, 'storage');
  const dbPath = path.resolve(requestedPath || path.join(storageDir, 'attraccess.sqlite'));
  return { dbPath, isLocal: dbPath === storageDir || dbPath.startsWith(`${storageDir}${path.sep}`) };
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
    await assertUsageIntegrity(db);
    await run(db, 'COMMIT');
    console.log(`Seeded local admin user id=${userId}`);
    console.log(`  username: ${username}`);
    console.log('  password: supplied via command arguments or the documented development default');
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
