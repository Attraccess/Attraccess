// The `.attraccess-matter-backup` file format. Pure: no I/O, no Nest, no database.
//
//   magic "ATTRMBK1" (8) | uint32 BE header length | header JSON (UTF-8) | ciphertext | 16-byte GCM tag
//
// The header is plaintext but authenticated: the AES-256-GCM additional data is every byte before the ciphertext. The
// body is gzip(JSON({ sidecar: { header, payload }, tables })) encrypted with a key derived from the recovery key.
// Anything that does not authenticate is rejected before a single byte of it is used.
import {
  COMPATIBILITY_TABLE,
  STORAGE_SCHEMA_VERSION,
  backupHeaderSchema,
  type BackupHeader,
} from '@attraccess/matter-contract';
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomUUID } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { z } from 'zod';
import { RECOVERY_KEY_BYTES, recoveryKeyId } from './recovery-key';

export const MAGIC = Buffer.from('ATTRMBK1', 'latin1');
export const FORMAT_VERSION = 1;
export const FILE_EXTENSION = '.attraccess-matter-backup';
const KDF_INFO = 'attraccess-matter-backup-v1';
const TAG_BYTES = 16;
const IV_BYTES = 12;
const SALT_BYTES = 32;
const MAX_HEADER_BYTES = 16 * 1024;
/** Upper bound of the decompressed body, so a crafted file cannot exhaust memory. */
const MAX_BODY_BYTES = 192 * 1024 * 1024;

export type BackupFormatErrorCode = 'truncated' | 'corrupt' | 'incompatible_format' | 'wrong_key';

/** Every way a file can fail to be a usable backup. The message never contains key material or file content. */
export class BackupFormatError extends Error {
  constructor(
    readonly code: BackupFormatErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

const base64 = (bytes: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9+/]+={0,2}$/)
    .max(bytes);

export const fileHeaderSchema = z.strictObject({
  formatVersion: z.literal(FORMAT_VERSION),
  backupId: z.uuid(),
  createdAt: z.iso.datetime(),
  pluginVersion: z.string().max(64),
  sidecarVersion: z.string().max(64),
  matterJsVersion: z.string().max(64),
  storageSchemaVersion: z.int().min(1),
  /** The last applied plugin migration: the plugin tables restore only onto the same schema. */
  pluginMigration: z.string().min(1).max(256),
  fabricId: z.string().regex(/^[0-9]{1,20}$/),
  rootCertFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  fabricGeneration: z.int().min(0),
  storageInstanceId: z.uuid(),
  recoveryKeyId: z.string().regex(/^[0-9a-f]{16}$/),
  kdfSalt: base64(64),
  iv: base64(32),
  /** Length of the ciphertext without the tag: tells a cut-off file from a damaged one. */
  ciphertextBytes: z.int().min(0),
  sections: z.strictObject({
    sidecarSnapshot: z.string().regex(/^[0-9a-f]{64}$/),
    pluginTables: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  /**
   * `false`: the plugin tables did not agree with the sidecar snapshot when the backup was taken (a pre-restore backup
   * in recovery). Absent in a consistent backup, so files without it stay readable.
   */
  consistent: z.literal(false).optional(),
});
export type FileHeader = z.infer<typeof fileHeaderSchema>;

export type TableRows = Record<string, Record<string, unknown>[]>;
export type SidecarSection = { header: BackupHeader; payload: string };
export type BackupBody = { sidecar: SidecarSection; tables: TableRows };

export type BackupMetadata = {
  backupId?: string;
  createdAt?: string;
  pluginVersion: string;
  pluginMigration: string;
  /** `false` for a backup whose tables do not belong to the sidecar snapshot; recorded in the authenticated header. */
  consistent?: boolean;
};

/** JSON with sorted keys at every level: the same value always digests to the same hash. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : inner,
  );
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

function deriveKey(recoveryKey: Buffer, salt: Buffer): Buffer {
  if (recoveryKey.length !== RECOVERY_KEY_BYTES)
    throw new BackupFormatError('wrong_key', 'The recovery key is invalid.');
  return Buffer.from(hkdfSync('sha256', recoveryKey, salt, KDF_INFO, 32));
}

/** Builds the encrypted file. `sidecar` is the snapshot as the sidecar returned it. */
export function encryptBackup(body: BackupBody, metadata: BackupMetadata, recoveryKey: Buffer): Buffer {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const plaintext = gzipSync(Buffer.from(JSON.stringify(body), 'utf8'));
  const cipher = createCipheriv('aes-256-gcm', deriveKey(recoveryKey, salt), iv);
  // The header is authenticated as a whole, so its length must be known before the tag is computed: the ciphertext
  // length of GCM equals the plaintext length.
  const header: FileHeader = {
    formatVersion: FORMAT_VERSION,
    backupId: metadata.backupId ?? randomUUID(),
    createdAt: metadata.createdAt ?? new Date().toISOString(),
    pluginVersion: metadata.pluginVersion,
    sidecarVersion: body.sidecar.header.sidecarVersion,
    matterJsVersion: body.sidecar.header.matterJsVersion,
    storageSchemaVersion: body.sidecar.header.storageSchemaVersion,
    pluginMigration: metadata.pluginMigration,
    fabricId: body.sidecar.header.fabricId,
    rootCertFingerprint: body.sidecar.header.rootCertFingerprint,
    fabricGeneration: body.sidecar.header.fabricGeneration,
    storageInstanceId: body.sidecar.header.storageInstanceId,
    recoveryKeyId: recoveryKeyId(recoveryKey),
    kdfSalt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ciphertextBytes: plaintext.length,
    sections: {
      sidecarSnapshot: sha256(canonicalJson(body.sidecar)),
      pluginTables: sha256(canonicalJson(body.tables)),
    },
    ...(metadata.consistent === false ? { consistent: false as const } : {}),
  };
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
  const prefix = Buffer.concat([MAGIC, uint32(headerBytes.length), headerBytes]);
  cipher.setAAD(prefix);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([prefix, ciphertext, cipher.getAuthTag()]);
}

function uint32(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
}

type Parsed = { header: FileHeader; prefix: Buffer; ciphertext: Buffer; tag: Buffer };

/** Parses the structure only. The header is not authenticated yet: treat everything in it as a claim. */
function parse(file: Buffer): Parsed {
  if (file.length < MAGIC.length + 4) throw new BackupFormatError('truncated', 'The file is too short to be a backup.');
  if (!file.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new BackupFormatError('incompatible_format', 'The file is not an Attraccess Matter backup.');
  }
  const headerLength = file.readUInt32BE(MAGIC.length);
  if (headerLength === 0 || headerLength > MAX_HEADER_BYTES) {
    throw new BackupFormatError('corrupt', 'The backup header is damaged.');
  }
  const bodyStart = MAGIC.length + 4 + headerLength;
  if (file.length < bodyStart + TAG_BYTES) throw new BackupFormatError('truncated', 'The backup file is cut off.');
  let json: unknown;
  try {
    json = JSON.parse(file.subarray(MAGIC.length + 4, bodyStart).toString('utf8'));
  } catch {
    throw new BackupFormatError('corrupt', 'The backup header is damaged.');
  }
  const version = (json as { formatVersion?: unknown } | null)?.formatVersion;
  if (version !== FORMAT_VERSION) {
    throw new BackupFormatError('incompatible_format', 'The backup was written in a format this version cannot read.');
  }
  const header = fileHeaderSchema.safeParse(json);
  if (!header.success) throw new BackupFormatError('corrupt', 'The backup header is damaged.');
  const expected = header.data.ciphertextBytes + TAG_BYTES;
  const actual = file.length - bodyStart;
  if (actual < expected) throw new BackupFormatError('truncated', 'The backup file is cut off.');
  if (actual > expected) throw new BackupFormatError('corrupt', 'The backup file has unexpected trailing data.');
  return {
    header: header.data,
    prefix: file.subarray(0, bodyStart),
    ciphertext: file.subarray(bodyStart, file.length - TAG_BYTES),
    tag: file.subarray(file.length - TAG_BYTES),
  };
}

/** The claimed header, to show what a file is and to pick the key. Not authenticated: `decryptBackup` does that. */
export function readHeader(file: Buffer): FileHeader {
  return parse(file).header;
}

const bodySchema = z.object({
  sidecar: z.object({ header: backupHeaderSchema, payload: z.string().min(4) }),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

/**
 * Authenticates and decrypts. Throws `BackupFormatError` for a wrong key, damage anywhere (header or body) and an
 * unreadable format. Nothing is returned unless the GCM tag, both section digests and the inner snapshot agree.
 */
export function decryptBackup(file: Buffer, recoveryKey: Buffer): { header: FileHeader; body: BackupBody } {
  const { header, prefix, ciphertext, tag } = parse(file);
  if (recoveryKeyId(recoveryKey) !== header.recoveryKeyId) {
    throw new BackupFormatError('wrong_key', 'This backup was encrypted with a different recovery key.');
  }
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveKey(recoveryKey, Buffer.from(header.kdfSalt, 'base64')),
      Buffer.from(header.iv, 'base64'),
    );
    decipher.setAAD(prefix);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // The key matches the claimed key ID, so the file was altered or damaged.
    throw new BackupFormatError('corrupt', 'The backup is damaged or has been modified.');
  }
  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(
      JSON.parse(gunzipSync(plaintext, { maxOutputLength: MAX_BODY_BYTES }).toString('utf8')),
    );
    if (!parsed.success) throw new Error('shape');
    body = parsed.data;
  } catch {
    throw new BackupFormatError('corrupt', 'The backup content is damaged.');
  }
  const sidecar = body.sidecar as SidecarSection;
  const payload = Buffer.from(sidecar.payload, 'base64');
  const consistent =
    sha256(canonicalJson(sidecar)) === header.sections.sidecarSnapshot &&
    sha256(canonicalJson(body.tables)) === header.sections.pluginTables &&
    createHash('sha256').update(payload).digest('hex') === sidecar.header.payloadSha256 &&
    payload.length === sidecar.header.payloadBytes &&
    sidecar.header.fabricId === header.fabricId &&
    sidecar.header.fabricGeneration === header.fabricGeneration &&
    sidecar.header.rootCertFingerprint === header.rootCertFingerprint &&
    sidecar.header.storageInstanceId === header.storageInstanceId;
  if (!consistent) throw new BackupFormatError('corrupt', 'The backup content does not match its header.');
  return { header, body: { sidecar, tables: body.tables as TableRows } };
}

export type CompatibilityCode = 'incompatible_schema' | 'incompatible_migration' | 'incompatible_version';

export class BackupIncompatibleError extends Error {
  constructor(
    readonly code: CompatibilityCode,
    message: string,
  ) {
    super(message);
    this.name = 'BackupIncompatibleError';
  }
}

export type LocalSchema = { pluginMigration: string | null };

/**
 * Whether a backup can be restored onto this installation: the same sidecar storage schema, the same plugin
 * migration, and a release combination the compatibility table lists.
 */
export function assertCompatible(header: FileHeader, local: LocalSchema): void {
  if (header.storageSchemaVersion !== STORAGE_SCHEMA_VERSION) {
    throw new BackupIncompatibleError(
      'incompatible_schema',
      'The backup uses a different Matter storage layout than this installation.',
    );
  }
  if (local.pluginMigration === null || header.pluginMigration !== local.pluginMigration) {
    throw new BackupIncompatibleError(
      'incompatible_migration',
      'The backup was made with a different database layout of the Matter plugin than the installed one.',
    );
  }
  const listed = COMPATIBILITY_TABLE.some(
    (entry) =>
      entry.plugin === header.pluginVersion &&
      entry.sidecar === header.sidecarVersion &&
      entry.matterJs === header.matterJsVersion,
  );
  if (!listed) {
    throw new BackupIncompatibleError(
      'incompatible_version',
      'The backup was made with a release combination of the Matter plugin and sidecar that is not supported.',
    );
  }
}
