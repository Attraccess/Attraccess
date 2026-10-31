import { constants, createHash, createPrivateKey, createPublicKey, KeyObject, sign, verify } from 'crypto';
import { crc32 } from 'zlib';

/**
 * ESP Secure Boot v2 (RSA-3072) signing, byte-compatible with
 * `espsecure sign-data --version 2`. Signature tests cross-check against
 * fixtures produced by espsecure.
 */

export const SECURE_BOOT_SECTOR_SIZE = 4096;
export const SECURE_BOOT_SIG_BLOCK_SIZE = 1216;
export const SECURE_BOOT_RSA_KEY_BITS = 3072;

const SIG_BLOCK_MAGIC = 0xe7;
const SIG_BLOCK_VERSION_RSA = 0x02;
const KEY_BYTES = SECURE_BOOT_RSA_KEY_BITS / 8;
const PSS_SALT_LENGTH = 32;
// Signature block layout: header(4) digest(32) N(384) e(4) R(384) M'(4) sig(384) crc(4) pad(16)
const CRC_COVERED_BYTES = 1196;

function bigIntToLittleEndian(value: bigint, length: number): Buffer {
  const out = Buffer.alloc(length);
  let remaining = value;
  for (let i = 0; i < length; i++) {
    out[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  if (remaining !== 0n) throw new Error('Value does not fit in the requested length');
  return out;
}

function bufferToBigInt(buffer: Buffer): bigint {
  return BigInt(`0x${buffer.toString('hex') || '0'}`);
}

/** Inverse of an odd value modulo 2^32 via Newton iteration. */
function modInverse32(value: bigint): bigint {
  const mod = 1n << 32n;
  let x = 1n;
  for (let i = 0; i < 6; i++) x = (x * (2n - value * x)) % mod;
  return ((x % mod) + mod) % mod;
}

interface SecureBootPublicKey {
  n: bigint;
  e: bigint;
}

function toPublicKey(key: KeyObject): KeyObject {
  return key.type === 'public' ? key : createPublicKey(key);
}

function extractPublicKey(key: KeyObject): SecureBootPublicKey {
  const jwk = toPublicKey(key).export({ format: 'jwk' });
  const n = bufferToBigInt(Buffer.from(jwk.n as string, 'base64url'));
  const e = bufferToBigInt(Buffer.from(jwk.e as string, 'base64url'));
  if (n.toString(2).length !== SECURE_BOOT_RSA_KEY_BITS) {
    throw new Error(`Secure Boot v2 requires an RSA-${SECURE_BOOT_RSA_KEY_BITS} key`);
  }
  return { n, e };
}

/** SHA-256 over the DER SubjectPublicKeyInfo, as the stable key identity. */
export function publicKeyFingerprint(key: KeyObject): string {
  return createHash('sha256')
    .update(toPublicKey(key).export({ format: 'der', type: 'spki' }))
    .digest('hex');
}

/**
 * The 32-byte digest the chip compares against the burned eFuse key digest:
 * SHA-256 over N(384 LE) | e(4 LE) | R(384 LE) | M'(4 LE) — the public-key part
 * of the signature block (what `espsecure digest-sbv2-public-key` computes).
 */
export function secureBootKeyDigest(key: KeyObject): string {
  const { n, e } = extractPublicKey(key);
  return createHash('sha256').update(encodePublicKeyFields(n, e)).digest('hex');
}

function encodePublicKeyFields(n: bigint, e: bigint): Buffer {
  const rinv = (1n << BigInt(SECURE_BOOT_RSA_KEY_BITS * 2)) % n;
  const mPrime = -modInverse32(n & 0xffffffffn) & 0xffffffffn;
  return Buffer.concat([
    bigIntToLittleEndian(n, KEY_BYTES),
    bigIntToLittleEndian(e, 4),
    bigIntToLittleEndian(rinv, KEY_BYTES),
    bigIntToLittleEndian(mPrime, 4),
  ]);
}

function padToSector(data: Buffer): Buffer {
  const remainder = data.length % SECURE_BOOT_SECTOR_SIZE;
  if (remainder === 0) return data;
  return Buffer.concat([data, Buffer.alloc(SECURE_BOOT_SECTOR_SIZE - remainder, 0xff)]);
}

function buildSignatureBlock(digest: Buffer, publicKey: SecureBootPublicKey, signature: Buffer): Buffer {
  const head = Buffer.from([SIG_BLOCK_MAGIC, SIG_BLOCK_VERSION_RSA, 0, 0]);
  const body = Buffer.concat([
    head,
    digest,
    encodePublicKeyFields(publicKey.n, publicKey.e),
    Buffer.from(signature).reverse(),
  ]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32LE(crc32(body.subarray(0, CRC_COVERED_BYTES)));
  const block = Buffer.concat([body, crc, Buffer.alloc(16)]);
  if (block.length !== SECURE_BOOT_SIG_BLOCK_SIZE) throw new Error('Incorrect signature block size');
  return block;
}

/**
 * eFuse digests of the public device-lab keys (apps/attractap/firmware/lab/secure-boot).
 * Anyone can sign with them, so they must never sign a customer image.
 */
export const LAB_SECURE_BOOT_KEY_DIGESTS: ReadonlySet<string> = new Set([
  'fd0e62812a67e20c36a85321733343e8ebd420e2d7940bbfd49ac9e1c502b29d', // lab signing key
  '65c97f279aa20b82d134fd6cc0eeb39d51e42a50d9c3d771f25b42e6487fafd9', // lab recovery key
]);

/**
 * SHA-256 of the lab keys' moduli (big-endian). Their primes are public, so anyone
 * can derive another working key from the same modulus with a different exponent;
 * the eFuse digest covers the exponent and would not catch that.
 */
const LAB_SECURE_BOOT_MODULUS_DIGESTS: ReadonlySet<string> = new Set([
  '57b40bb3288d65e6d45854edb0c763ba93cf712aa262de98de078e0f2b68dbb9', // lab signing key
  '520d9e203032ac50a7d2cf422af834348cc8221cbf83ec1f1e647cf196971843', // lab recovery key
]);

function isLabKey(key: KeyObject): boolean {
  const modulus = Buffer.from(toPublicKey(key).export({ format: 'jwk' }).n as string, 'base64url');
  return (
    LAB_SECURE_BOOT_KEY_DIGESTS.has(secureBootKeyDigest(key)) ||
    LAB_SECURE_BOOT_MODULUS_DIGESTS.has(createHash('sha256').update(modulus).digest('hex'))
  );
}

/**
 * Sign an image the way `espsecure sign-data --version 2` does: pad to a 4 KB
 * sector, RSA-PSS(SHA-256, salt 32) over the padded contents, then append a
 * 4 KB signature sector holding the block (unused space 0xFF).
 */
export function signSecureBootImage(image: Buffer, privateKeyPem: string | KeyObject): Buffer {
  const privateKey = typeof privateKeyPem === 'string' ? createPrivateKey(privateKeyPem) : privateKeyPem;
  const publicKey = extractPublicKey(privateKey);
  if (isLabKey(privateKey)) {
    throw new Error('Refusing to sign with a public device-lab Secure Boot key');
  }
  if (hasSignatureSector(image)) {
    throw new Error('Image already carries a signature sector');
  }
  const contents = padToSector(image);
  const digest = createHash('sha256').update(contents).digest();
  const signature = sign('sha256', contents, {
    key: privateKey,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: PSS_SALT_LENGTH,
  });
  const block = buildSignatureBlock(digest, publicKey, signature);
  const sector = Buffer.concat([block, Buffer.alloc(SECURE_BOOT_SECTOR_SIZE - block.length, 0xff)]);
  return Buffer.concat([contents, sector]);
}

/** Signed images are sector-aligned and end in a sector holding a valid signature block. */
function hasSignatureSector(image: Buffer): boolean {
  if (image.length < SECURE_BOOT_SECTOR_SIZE * 2 || image.length % SECURE_BOOT_SECTOR_SIZE !== 0) return false;
  const block = image.subarray(image.length - SECURE_BOOT_SECTOR_SIZE);
  return (
    block[0] === SIG_BLOCK_MAGIC &&
    block[1] === SIG_BLOCK_VERSION_RSA &&
    block.readUInt32LE(CRC_COVERED_BYTES) === crc32(block.subarray(0, CRC_COVERED_BYTES))
  );
}

export interface SecureBootVerification {
  valid: boolean;
  keyDigest?: string;
}

/** Verify block 0 of a signed image against a public key (reader-side check mirrored on the server). */
export function verifySecureBootImage(signed: Buffer, publicKeyPem: string | KeyObject): SecureBootVerification {
  if (signed.length < SECURE_BOOT_SECTOR_SIZE * 2 || signed.length % SECURE_BOOT_SECTOR_SIZE !== 0) {
    return { valid: false };
  }
  const contents = signed.subarray(0, signed.length - SECURE_BOOT_SECTOR_SIZE);
  const block = signed.subarray(
    signed.length - SECURE_BOOT_SECTOR_SIZE,
    signed.length - SECURE_BOOT_SECTOR_SIZE + SECURE_BOOT_SIG_BLOCK_SIZE,
  );
  if (block[0] !== SIG_BLOCK_MAGIC || block[1] !== SIG_BLOCK_VERSION_RSA) return { valid: false };
  if (block.readUInt32LE(CRC_COVERED_BYTES) !== crc32(block.subarray(0, CRC_COVERED_BYTES))) return { valid: false };

  const digest = createHash('sha256').update(contents).digest();
  if (!digest.equals(block.subarray(4, 36))) return { valid: false };

  const key = typeof publicKeyPem === 'string' ? createPublicKey(publicKeyPem) : publicKeyPem;
  let expectedFields: Buffer;
  try {
    const { n, e } = extractPublicKey(key);
    expectedFields = encodePublicKeyFields(n, e);
  } catch {
    return { valid: false }; // not an RSA-3072 key: cannot have signed this image
  }
  const keyFields = block.subarray(36, 36 + expectedFields.length);
  if (!keyFields.equals(expectedFields)) return { valid: false };

  const signature = Buffer.from(block.subarray(36 + expectedFields.length, CRC_COVERED_BYTES)).reverse();
  const valid = verify(
    'sha256',
    contents,
    { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: PSS_SALT_LENGTH },
    signature,
  );
  return { valid, keyDigest: createHash('sha256').update(keyFields).digest('hex') };
}
