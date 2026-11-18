#!/usr/bin/env node
/* eslint-disable no-console -- CLI output. */
// Gives this checkout its own PostgreSQL database inside the shared dev PostgreSQL (services.docker-compose.yml):
// attraccess_<checkout-folder-slug>. Creates it when missing and writes DATABASE_URL into .env.
// An existing DATABASE_URL (environment or .env) wins: its database is created if missing, nothing else changes.
//
// Admin connection (creates databases): DEV_POSTGRES_URL, else
//   postgres://attraccess:attraccess@127.0.0.1:${POSTGRES_PORT:-5432}/postgres
// When nothing answers and Docker is available, the shared `postgres` dev service is started.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const MAX_DATABASE_NAME = 63;
const PREFIX = 'attraccess_';

/** attraccess_<folder>, lower case [a-z0-9_], at most 63 characters (a hash keeps long names unique). */
export function databaseNameFor(folderName) {
  const slug = folderName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const name = `${PREFIX}${slug || 'dev'}`;
  if (name.length <= MAX_DATABASE_NAME) return name;
  const hash = createHash('sha256').update(folderName).digest('hex').slice(0, 8);
  return `${name.slice(0, MAX_DATABASE_NAME - 9).replace(/_+$/, '')}_${hash}`;
}

export function adminUrl(env = process.env) {
  return (
    env.DEV_POSTGRES_URL?.trim() || `postgres://attraccess:attraccess@127.0.0.1:${env.POSTGRES_PORT || 5432}/postgres`
  );
}

export function withDatabase(url, name) {
  const parsed = new URL(url);
  parsed.pathname = `/${encodeURIComponent(name)}`;
  return parsed.toString();
}

/** Sets KEY=value in .env contents: replaces an active line, else appends. */
export function setEnvValue(contents, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(contents)) return contents.replace(pattern, () => line);
  return `${contents}${contents === '' || contents.endsWith('\n') ? '' : '\n'}${line}\n`;
}

export function readEnvValue(contents, key) {
  const match = new RegExp(`^${key}=(.*)$`, 'm').exec(contents);
  return match ? match[1].trim().replace(/^(['"])(.*)\1$/, '$2') : undefined;
}

async function connect(url, { attempts = 1 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

function startSharedService(repoRoot) {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '-p',
      'attraccess-dev-services',
      '-f',
      path.join(repoRoot, 'services.docker-compose.yml'),
      'up',
      '-d',
      '--wait',
      'postgres',
    ],
    { stdio: 'inherit', env: process.env },
  );
  return result.status === 0;
}

export async function ensureDevDatabase({ repoRoot, env = process.env, log = console.log } = {}) {
  const envFile = path.join(repoRoot, '.env');
  const envContents = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  const configured = env.DATABASE_URL?.trim() || readEnvValue(envContents, 'DATABASE_URL');
  const admin = adminUrl(env);
  const name = configured
    ? decodeURIComponent(new URL(configured).pathname.slice(1))
    : databaseNameFor(path.basename(repoRoot));
  const connection = configured ?? withDatabase(admin, name);
  // Same credentials/host as the target, so a configured DATABASE_URL does not need the shared dev admin account.
  const adminConnection = configured ? withDatabase(configured, 'postgres') : admin;

  let client;
  try {
    client = await connect(adminConnection);
  } catch {
    if (!env.DEV_POSTGRES_URL && !configured && startSharedService(repoRoot)) {
      client = await connect(adminConnection, { attempts: 30 });
    } else {
      throw new Error(
        `Cannot reach PostgreSQL at ${new URL(adminConnection).host}. Start the dev database with "pnpm services up postgres" (set POSTGRES_PORT if 5432 is taken) or set DATABASE_URL / DEV_POSTGRES_URL.`,
      );
    }
  }
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
      log(`✓ Created database ${name}`);
    } else {
      log(`✓ Database ${name} exists`);
    }
  } finally {
    await client.end();
  }

  if (!configured || readEnvValue(envContents, 'DATABASE_URL') !== configured) {
    writeFileSync(envFile, setEnvValue(envContents, 'DATABASE_URL', connection));
    log('✓ Wrote DATABASE_URL to .env');
  }
  return { name, url: connection };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  ensureDevDatabase({ repoRoot }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
