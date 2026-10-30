#!/usr/bin/env node
/* eslint-disable no-console -- CLI output. */
// Re-encrypts stored NFC card keys from one AUTH_SESSION_SECRET to another, in one transaction.
// Usage: OLD_AUTH_SESSION_SECRET=... NEW_AUTH_SESSION_SECRET=... pnpm nx run api:reencrypt-card-keys [-- --dry-run]
// Reads STORAGE_ROOT like the API. Stop the API first and keep a copy of attraccess.sqlite.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sqlite3pkg from 'sqlite3';
import { resolveDatabasePath } from '../src/config/storage-path.ts';

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
  const databasePath = resolveDatabasePath();
  if (!existsSync(databasePath)) throw new Error(`database not found: ${databasePath}`);
  const dryRun = process.argv.includes('--dry-run');
  const db = new (sqlite3pkg.verbose().Database)(databasePath);
  try {
    const counts = await reencryptCardKeys(
      db,
      process.env.OLD_AUTH_SESSION_SECRET,
      process.env.NEW_AUTH_SESSION_SECRET,
      { dryRun },
    );
    console.log(`${dryRun ? 'Checked (nothing written)' : 'Re-encrypted'}: ${JSON.stringify(counts)}`);
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
