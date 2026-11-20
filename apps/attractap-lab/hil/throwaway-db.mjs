#!/usr/bin/env node
// Creates and drops the throwaway PostgreSQL database of a lab run (hil/run.sh, real-cards/run-real-card-session.sh).
//   node throwaway-db.mjs create   prints the connection URL of a new, empty database
//   node throwaway-db.mjs drop URL drops the database URL names
// The server comes from HIL_DATABASE_ADMIN_URL, else DATABASE_URL, else the repository's .env.
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { postgresProvider, describeLocation } from '../../api/scripts/lib/database-provider.mjs';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) loadEnvFile(envFile);

const quote = (name) => `"${name.split('"').join('""')}"`;
const withDatabase = (url, name) => {
  const parsed = new URL(url);
  parsed.pathname = `/${encodeURIComponent(name)}`;
  return parsed.toString();
};

const adminUrl = (process.env.HIL_DATABASE_ADMIN_URL || process.env.DATABASE_URL || '').trim();
if (!adminUrl) {
  console.error('Set HIL_DATABASE_ADMIN_URL (or DATABASE_URL): a PostgreSQL server the lab run may create a database on');
  process.exit(2);
}
const [command, target] = process.argv.slice(2);
// Connect to the maintenance database of the server, never to the database being dropped.
const admin = await postgresProvider.open(withDatabase(adminUrl, 'postgres'));
try {
  if (command === 'create') {
    const name = `attraccess_hil_${randomBytes(6).toString('hex')}`;
    await admin.query(`CREATE DATABASE ${quote(name)}`);
    process.stdout.write(withDatabase(adminUrl, name));
  } else if (command === 'drop' && target) {
    const { database } = describeLocation(target);
    if (!database.startsWith('attraccess_hil_')) throw new Error('refusing to drop a database that is not a lab run database');
    await admin.query(`DROP DATABASE IF EXISTS ${quote(database)} WITH (FORCE)`);
  } else {
    console.error('usage: throwaway-db.mjs create | drop URL');
    process.exitCode = 2;
  }
} finally {
  await postgresProvider.close(admin);
}
