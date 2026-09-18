import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes } from 'node:crypto';
import type { ManagementKey } from './wago-management.types';

const field = (value: Buffer | string): Buffer => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  return Buffer.concat([length, bytes]);
};
const magic = Buffer.from('openssh-key-v1\0');
const algorithm = 'ssh-ed25519';
const publicBlob = (bytes: Buffer) => Buffer.concat([field(algorithm), field(bytes)]);
const fingerprint = (blob: Buffer) => `SHA256:${createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')}`;

/** OpenSSH PROTOCOL.key (https://github.com/openssh/openssh-portable/blob/master/PROTOCOL.key).
 * Generate in memory: no subprocess, agent, private-key file or plaintext database column.
 * OpenSSH format is required: OpenSSH clients do not universally accept Ed25519 PKCS#8 PEM.
 */
export function generateManagementKey(): ManagementKey {
  const pair = generateKeyPairSync('ed25519');
  const jwk = pair.privateKey.export({ format: 'jwk' });
  if (typeof jwk.d !== 'string' || typeof jwk.x !== 'string') throw new Error('invalid_key');
  const seed = Buffer.from(jwk.d, 'base64url'),
    pub = Buffer.from(jwk.x, 'base64url');
  const check = randomBytes(4);
  let inner = Buffer.concat([check, check, field(algorithm), field(pub), field(Buffer.concat([seed, pub])), field('')]);
  const padding = 8 - (inner.length % 8);
  inner = Buffer.concat([inner, Buffer.from(Array.from({ length: padding }, (_, i) => i + 1))]);
  const bytes = Buffer.concat([
    magic,
    field('none'),
    field('none'),
    field(''),
    Buffer.from([0, 0, 0, 1]),
    field(publicBlob(pub)),
    field(inner),
  ]);
  seed.fill(0);
  const encoded = bytes
    .toString('base64')
    .match(/.{1,70}/g)
    ?.join('\n') ?? '';
  return {
    privateKey: `-----BEGIN OPENSSH PRIVATE KEY-----\n${encoded}\n-----END OPENSSH PRIVATE KEY-----\n`,
    publicKey: `${algorithm} ${publicBlob(pub).toString('base64')}`,
    fingerprint: fingerprint(publicBlob(pub)),
  };
}

export function assertManagementPublicKey(key: string): Buffer {
  if (!/^ssh-ed25519 [A-Za-z0-9+/]{68}$/.test(key)) throw new Error('invalid_key');
  const blob = Buffer.from(key.slice(12), 'base64');
  if (blob.length !== 51 || !blob.subarray(0, 19).equals(publicBlob(Buffer.alloc(32)).subarray(0, 19)))
    throw new Error('invalid_key');
  return blob;
}

/** Validate key type, length, private/public correspondence, padding and fingerprint before persisting or installing. */
export function assertManagementKey(key: ManagementKey): void {
  try {
    const blob = assertManagementPublicKey(key.publicKey);
    if (key.fingerprint !== fingerprint(blob) || key.privateKey.length > 4096) throw new Error();
    const match =
      /^-----BEGIN OPENSSH PRIVATE KEY-----\n([A-Za-z0-9+/=\n]+)\n-----END OPENSSH PRIVATE KEY-----\n$/.exec(
        key.privateKey,
      );
    if (!match) throw new Error();
    const bytes = Buffer.from(match[1].replace(/\n/g, ''), 'base64');
    if (!bytes.subarray(0, magic.length).equals(magic)) throw new Error();
    let offset = magic.length;
    const read = () => {
      const length = bytes.readUInt32BE(offset);
      offset += 4;
      if (length > bytes.length - offset) throw new Error();
      const value = bytes.subarray(offset, offset + length);
      offset += length;
      return value;
    };
    if (read().toString() !== 'none' || read().toString() !== 'none' || read().length !== 0) throw new Error();
    if (bytes.readUInt32BE(offset) !== 1) throw new Error();
    offset += 4;
    if (!read().equals(blob)) throw new Error();
    const inner = read();
    if (offset !== bytes.length || inner.length % 8 || !inner.subarray(0, 4).equals(inner.subarray(4, 8)))
      throw new Error();
    let cursor = 8;
    const part = () => {
      const length = inner.readUInt32BE(cursor);
      cursor += 4;
      if (length > inner.length - cursor) throw new Error();
      const value = inner.subarray(cursor, cursor + length);
      cursor += length;
      return value;
    };
    if (part().toString() !== algorithm) throw new Error();
    const pub = part(),
      priv = part();
    if (
      pub.length !== 32 ||
      priv.length !== 64 ||
      !priv.subarray(32).equals(pub) ||
      !publicBlob(pub).equals(blob) ||
      part().length
    )
      throw new Error();
    const derived = createPublicKey(
      createPrivateKey({
        key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), priv.subarray(0, 32)]),
        format: 'der',
        type: 'pkcs8',
      }),
    ).export({ format: 'jwk' });
    if (typeof derived.x !== 'string' || !Buffer.from(derived.x, 'base64url').equals(pub)) throw new Error();
    const padding = inner.subarray(cursor);
    if (!padding.length || padding.length > 8 || !padding.every((value, index) => value === index + 1))
      throw new Error();
  } catch {
    throw new Error('invalid_key');
  }
}

/** Restore only the key corresponding to persisted public metadata, never an arbitrary decrypted payload. */
export function restoreManagementKey(privateKey: string, expectedFingerprint?: string): ManagementKey {
  try {
    if (privateKey.length > 4096) throw new Error();
    const encoded = privateKey.split('\n').slice(1, -2).join('');
    const bytes = Buffer.from(encoded, 'base64');
    let offset = magic.length;
    const read = () => {
      const size = bytes.readUInt32BE(offset);
      offset += 4;
      if (size > bytes.length - offset) throw new Error();
      const value = bytes.subarray(offset, offset + size);
      offset += size;
      return value;
    };
    read();
    read();
    read();
    offset += 4;
    const blob = read();
    const key = {
      privateKey,
      publicKey: `${algorithm} ${blob.toString('base64')}`,
      fingerprint: expectedFingerprint ?? fingerprint(blob),
    };
    assertManagementKey(key);
    return key;
  } catch {
    throw new Error('invalid_key');
  }
}
