#!/usr/bin/env node
/* eslint-disable no-console -- Preserve operational diagnostics and CLI output. */
// Provider-backed local development seed. Usage: pnpm seed:dev -- [--demo] [--fixture file.json]
import { existsSync, realpathSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnvFile } from 'node:process';
import { loadDatabaseTooling } from './backend-runtime.mjs';

export function loadFixture(fixturePath) {
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

function within(directory, file) {
  const relative = path.relative(directory, file);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export async function main(
  argv = process.argv.slice(2),
  repoRoot = fileURLToPath(new URL('../../../', import.meta.url)),
) {
  repoRoot = path.resolve(repoRoot);
  const envFile = path.join(repoRoot, '.env');
  if (existsSync(envFile)) loadEnvFile(envFile);
  const args = parseArgs(argv);
  const tooling = loadDatabaseTooling();
  const config = tooling.resolveBackendConfig(process.env, repoRoot);
  const storageDir = tooling.resolveStorageRoot(process.env, repoRoot);
  const requestedPath = args.db || process.env.SEED_DB_PATH;
  const dbPath = requestedPath ? path.resolve(requestedPath) : config.database;
  const isLocal = within(repoRoot, storageDir) && within(storageDir, dbPath);
  if (!isLocal && !args['allow-external-db']) {
    throw new Error(
      'Refusing to seed a database outside configured local storage. Use --allow-external-db only for an isolated local database.',
    );
  }
  if (!existsSync(dbPath)) throw new Error(`DB not found at ${dbPath}. Start the API once so migrations create it.`);
  if (isLocal) {
    const resolvedStorageDir = realpathSync(storageDir);
    const resolvedDbPath = realpathSync(dbPath);
    if (!within(realpathSync(repoRoot), resolvedStorageDir) || !within(resolvedStorageDir, resolvedDbPath)) {
      throw new Error('Refusing to follow a database symlink outside configured local storage.');
    }
  }

  const username = String(args.username || 'admin').toLowerCase();
  const email = String(args.email || 'admin@local');
  const password = String(args.password || 'password');
  const fixture = args.fixture ? loadFixture(path.resolve(String(args.fixture))) : null;
  const { userId } = await tooling.seedDevelopmentData(dbPath, {
    admin: { username, email, password },
    demo: Boolean(args.demo),
    fixture,
  });
  console.log(`Seeded local admin user id=${userId}`);
  console.log(`  username: ${username}`);
  console.log('  password: supplied via command arguments or the documented development default');
  console.log(`  email:    ${email}`);
  if (args.demo) console.log('  demo fixture: applied');
  if (fixture) console.log(`  fixture: applied from ${args.fixture}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
