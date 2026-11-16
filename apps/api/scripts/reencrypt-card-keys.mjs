#!/usr/bin/env node
/* eslint-disable no-console -- CLI output. */
// Re-encrypts everything the API encrypts with AUTH_SESSION_SECRET that a new secret must still read:
// the NFC card keys and the reader pairing keys (the installation CA and server private keys). It
// moves them from one AUTH_SESSION_SECRET to another, in one transaction. The name stays
// reencrypt-card-keys for the nx target and the path in the Docker image.
//
// Usage: OLD_AUTH_SESSION_SECRET=... NEW_AUTH_SESSION_SECRET=... node reencrypt-card-keys.mjs [--dry-run] [--db <path>]
//   Source checkout: pnpm nx run api:reencrypt-card-keys -- --dry-run
//   Docker image:    node /app/dist/apps/api/scripts/reencrypt-card-keys.mjs --dry-run
// Without --db the database is <STORAGE_ROOT>/attraccess.sqlite, resolved like the API does.
// Stop the API first and keep a copy of attraccess.sqlite.
//
// Plain Node only: the production image has no TypeScript sources, so nothing here may import a .ts
// file (./lib/database-provider.mjs ships beside it). The only dependency is sqlite3, which the deployed API
// package ships; the provider selected by DATABASE_TYPE opens the database.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDatabaseProvider, sqliteProvider } from './lib/database-provider.mjs';

const SALT = Buffer.from('attraccess.encryption.salt', 'utf8');
const INFO = Buffer.from('attraccess|aes-256-gcm|content-encryption', 'utf8');
const VERSION = 'v1';
// Same format as EncryptionService: v1.<base64url(iv | ciphertext | tag)>.
// `name` is the key in the printed counts. Tables a database does not have yet are skipped.
export const TABLES = [
  { name: 'nfc_card', table: 'nfc_card', column: 'key' },
  { name: 'nfc_card_pending_change', table: 'nfc_card_pending_change', column: 'key' },
  // Reader pairing keys (since the reader pairing migration). Without them paired readers cannot connect.
  {
    name: 'attractap_installation.caPrivateKeyEncrypted',
    table: 'attractap_installation',
    column: 'caPrivateKeyEncrypted',
  },
  {
    name: 'attractap_installation.serverPrivateKeyEncrypted',
    table: 'attractap_installation',
    column: 'serverPrivateKeyEncrypted',
  },
];

export function deriveKey(secret) {
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret.trim(), 'utf8'), SALT, INFO, 32));
}

export function encrypt(key, plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url')}`;
}

export function decrypt(key, token) {
  const payload = Buffer.from(token.slice(VERSION.length + 1), 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(payload.length - 16));
  return Buffer.concat([decipher.update(payload.subarray(12, payload.length - 16)), decipher.final()]).toString('utf8');
}

/** Same rule as resolveDatabasePath() in apps/api/src/config/storage-path.ts (a test keeps them in step). */
export function resolveDatabasePath(env = process.env, cwd = process.cwd()) {
  return resolveDatabaseProvider(env).defaultLocation(env, cwd);
}

export function parseArgs(argv, env = process.env, cwd = process.cwd()) {
  let dryRun = false;
  let db;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--db') {
      db = argv[++i];
      if (!db) throw new Error('--db needs a path');
    } else if (arg.startsWith('--db=')) db = arg.slice('--db='.length);
    else if (arg === '--') continue;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return { dryRun, databasePath: db ? resolve(cwd, db) : resolveDatabasePath(env, cwd) };
}

/** Returns how many values were re-encrypted per table (column). Throws (and rolls back) when any value does not decrypt with the old secret. */
export async function reencryptCardKeys(db, oldSecret, newSecret, { dryRun = false, provider = sqliteProvider } = {}) {
  if (!oldSecret || !newSecret) throw new Error('OLD_AUTH_SESSION_SECRET and NEW_AUTH_SESSION_SECRET are required');
  if (oldSecret.trim() === newSecret.trim()) throw new Error('the old and the new secret are the same');
  const oldKey = deriveKey(oldSecret);
  const newKey = deriveKey(newSecret);
  const counts = {};
  await provider.begin(db, { writeLock: true });
  try {
    for (const { name, table, column } of TABLES) {
      if (!(await provider.hasTable(db, table))) continue;
      const rows = await provider.all(
        db,
        `SELECT id, "${column}" AS value FROM "${table}" WHERE "${column}" IS NOT NULL AND "${column}" != ''`,
      );
      counts[name] = 0;
      for (const row of rows) {
        // Unencrypted legacy values are encrypted with the new secret as they are.
        let plain = row.value;
        if (row.value.startsWith(`${VERSION}.`)) {
          try {
            plain = decrypt(oldKey, row.value);
          } catch {
            throw new Error(
              `${table}.${column} row ${row.id} cannot be read with OLD_AUTH_SESSION_SECRET. Is it the secret the data was written with? Nothing was changed.`,
            );
          }
        }
        await provider.run(db, `UPDATE "${table}" SET "${column}" = ? WHERE id = ?`, [encrypt(newKey, plain), row.id]);
        counts[name]++;
      }
    }
    await (dryRun ? provider.rollback(db) : provider.commit(db));
  } catch (error) {
    await provider.rollback(db).catch(() => undefined);
    throw error;
  }
  return counts;
}

async function main() {
  // Selecting the provider validates DATABASE_TYPE before the database is located or opened.
  const provider = resolveDatabaseProvider(process.env);
  const { dryRun, databasePath } = parseArgs(process.argv.slice(2));
  if (!existsSync(databasePath)) throw new Error(`database not found: ${databasePath}`);
  const db = await provider.open(databasePath);
  try {
    const counts = await reencryptCardKeys(
      db,
      process.env.OLD_AUTH_SESSION_SECRET,
      process.env.NEW_AUTH_SESSION_SECRET,
      { dryRun, provider },
    );
    console.log(
      `${dryRun ? 'Checked (nothing written)' : 'Re-encrypted'} card keys and reader pairing keys in ${databasePath}: ${JSON.stringify(counts)}`,
    );
    if (!dryRun) console.log('Now set AUTH_SESSION_SECRET to the new secret and start the API.');
  } finally {
    await provider.close(db);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`reencrypt-card-keys failed: ${error.message}`);
    process.exit(1);
  });
}
