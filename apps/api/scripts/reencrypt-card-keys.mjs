#!/usr/bin/env node
/* eslint-disable no-console -- CLI output. */
// Re-encrypts stored NFC card keys from one AUTH_SESSION_SECRET to another, in one transaction.
//
// Usage: OLD_AUTH_SESSION_SECRET=... NEW_AUTH_SESSION_SECRET=... node reencrypt-card-keys.mjs [--dry-run] [--db <path>]
//   Source checkout: pnpm nx run api:reencrypt-card-keys -- --dry-run
//   Docker image:    node /app/dist/apps/api/scripts/reencrypt-card-keys.mjs --dry-run
// Without --db the database is <STORAGE_ROOT>/attraccess.sqlite, resolved like the API does.
// Stop the API first and keep a copy of attraccess.sqlite.
//
// Plain Node only: the production image has no TypeScript sources, so nothing here may import a .ts
// file. The only dependency is sqlite3, which the deployed API package ships.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3pkg from 'sqlite3';

const SALT = Buffer.from('attraccess.encryption.salt', 'utf8');
const INFO = Buffer.from('attraccess|aes-256-gcm|content-encryption', 'utf8');
const VERSION = 'v1';
// Same format as EncryptionService: v1.<base64url(iv | ciphertext | tag)>.
const TABLES = [
  { table: 'nfc_card', column: 'key' },
  { table: 'nfc_card_pending_change', column: 'key' },
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
  const storageRoot = resolve(cwd, env.STORAGE_ROOT ?? join(cwd, 'storage'));
  return join(storageRoot, 'attraccess.sqlite');
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

const call = (db, method, sql, params = []) =>
  new Promise((resolve, reject) =>
    db[method](sql, params, (error, result) => (error ? reject(error) : resolve(result))),
  );

/** Returns how many values were re-encrypted per table. Throws (and rolls back) when any value does not decrypt with the old secret. */
export async function reencryptCardKeys(db, oldSecret, newSecret, { dryRun = false } = {}) {
  if (!oldSecret || !newSecret) throw new Error('OLD_AUTH_SESSION_SECRET and NEW_AUTH_SESSION_SECRET are required');
  if (oldSecret.trim() === newSecret.trim()) throw new Error('the old and the new secret are the same');
  const oldKey = deriveKey(oldSecret);
  const newKey = deriveKey(newSecret);
  const counts = {};
  await call(db, 'run', 'BEGIN IMMEDIATE');
  try {
    for (const { table, column } of TABLES) {
      const exists = await call(db, 'get', "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]);
      if (!exists) continue;
      const rows = await call(
        db,
        'all',
        `SELECT id, "${column}" AS value FROM "${table}" WHERE "${column}" IS NOT NULL AND "${column}" != ''`,
      );
      counts[table] = 0;
      for (const row of rows) {
        // Unencrypted legacy values are encrypted with the new secret as they are.
        let plain = row.value;
        if (row.value.startsWith(`${VERSION}.`)) {
          try {
            plain = decrypt(oldKey, row.value);
          } catch {
            throw new Error(
              `${table} row ${row.id} cannot be read with OLD_AUTH_SESSION_SECRET. Is it the secret the data was written with? Nothing was changed.`,
            );
          }
        }
        await call(db, 'run', `UPDATE "${table}" SET "${column}" = ? WHERE id = ?`, [encrypt(newKey, plain), row.id]);
        counts[table]++;
      }
    }
    await call(db, 'run', dryRun ? 'ROLLBACK' : 'COMMIT');
  } catch (error) {
    await call(db, 'run', 'ROLLBACK').catch(() => undefined);
    throw error;
  }
  return counts;
}

async function main() {
  const { dryRun, databasePath } = parseArgs(process.argv.slice(2));
  if (!existsSync(databasePath)) throw new Error(`database not found: ${databasePath}`);
  const db = new (sqlite3pkg.verbose().Database)(databasePath);
  try {
    const counts = await reencryptCardKeys(
      db,
      process.env.OLD_AUTH_SESSION_SECRET,
      process.env.NEW_AUTH_SESSION_SECRET,
      { dryRun },
    );
    console.log(
      `${dryRun ? 'Checked (nothing written)' : 'Re-encrypted'} in ${databasePath}: ${JSON.stringify(counts)}`,
    );
    if (!dryRun) console.log('Now set AUTH_SESSION_SECRET to the new secret and start the API.');
  } finally {
    db.close();
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`reencrypt-card-keys failed: ${error.message}`);
    process.exit(1);
  });
}
