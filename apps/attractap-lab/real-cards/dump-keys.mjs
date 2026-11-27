#!/usr/bin/env node
/* eslint-disable no-console -- Command-line tool: its output is the point. */
// Prints the card keys the API holds as JSON: [{label, uid, keyNo, hex, source}], decrypted with the
// API's AUTH_SESSION_SECRET (same HKDF + AES-256-GCM as apps/api/src/encryption). Read-only.
//   AUTH_SESSION_SECRET=... DATABASE_URL=postgres://... node dump-keys.mjs
import { createDecipheriv, hkdfSync } from 'node:crypto';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Lab tooling runs the API's database provider script as is; nothing is bundled.
import { postgresProvider } from '../../api/scripts/lib/database-provider.mjs';

const secret = (process.env.AUTH_SESSION_SECRET ?? '').trim();
if (!secret || !process.env.DATABASE_URL) { console.error('usage: AUTH_SESSION_SECRET=... DATABASE_URL=... dump-keys.mjs'); process.exit(2); }
const key = Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.from('attraccess.encryption.salt'), Buffer.from('attraccess|aes-256-gcm|content-encryption'), 32));
const decrypt = (token) => {
  if (!token) return null;
  if (!token.startsWith('v1.')) return token;
  const payload = Buffer.from(token.slice(3), 'base64url');
  const d = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
  d.setAuthTag(payload.subarray(payload.length - 16));
  return Buffer.concat([d.update(payload.subarray(12, payload.length - 16)), d.final()]).toString('utf8');
};
const db = await postgresProvider.open(postgresProvider.defaultLocation(process.env));
const out = [];
for (const r of await postgresProvider.all(db, 'SELECT id, uid, "keyNo", "key" FROM nfc_card')) {
  const hex = decrypt(r.key);
  if (hex) out.push({ label: `card ${r.id} uid ${r.uid} slot ${r.keyNo}`, uid: r.uid, keyNo: r.keyNo, hex, source: 'nfc_card' });
}
for (const r of await postgresProvider.all(db, 'SELECT id, uid, kind, "keyNo", "key" FROM nfc_card_pending_change')) {
  const hex = decrypt(r.key);
  if (hex) out.push({ label: `pending ${r.kind} ${r.id} uid ${r.uid} slot ${r.keyNo}`, uid: r.uid, keyNo: r.keyNo, hex, source: 'nfc_card_pending_change' });
}
await postgresProvider.close(db);
console.log(JSON.stringify(out));
