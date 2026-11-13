import {
  STORAGE_SCHEMA_VERSION,
  recoveryReasonSchema,
  timestampSchema,
  uuidSchema,
  matterId64Schema,
} from '@attraccess/matter-contract';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { directoryHasFiles, sha256Hex } from './archive';

export type RecoveryReason = z.infer<typeof recoveryReasonSchema>;

/** Where the sidecar keeps what it owns. Everything lives under one directory, which needs its own persistent volume. */
export type StorageLayout = {
  root: string;
  /** matter.js storage root; the controller node stores under `<matterDir>/controller`. */
  matterDir: string;
  controllerDir: string;
  metadataFile: string;
  stagingDir: string;
  rollbackDir: string;
};

export const CONTROLLER_NODE_ID = 'controller';

export function layoutFor(root: string): StorageLayout {
  const matterDir = join(root, 'matter');
  return {
    root,
    matterDir,
    controllerDir: join(matterDir, CONTROLLER_NODE_ID),
    metadataFile: join(root, 'sidecar-metadata.json'),
    stagingDir: join(root, 'restore-staging'),
    rollbackDir: join(root, 'restore-rollback'),
  };
}

/** An operational start-up failure: the message is complete, so no stack trace is needed. `code` marks it as operational. */
export class StorageDirError extends Error {
  readonly code = 'STORAGE_DIR_NOT_WRITABLE';
}

/** Creates the storage directory (0700) and proves it is writable. */
export function ensureStorageDir(root: string): void {
  try {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const probe = join(root, `.write-test-${randomUUID()}`);
    writeFileSync(probe, 'x', { mode: 0o600 });
    rmSync(probe);
  } catch {
    throw new StorageDirError(
      'MATTER_SIDECAR_STORAGE_DIR: the directory cannot be created or is not writable. ' +
        'Mount a persistent volume that the sidecar user may write to, or set MATTER_SIDECAR_STORAGE_DIR',
    );
  }
}

// --- metadata -----------------------------------------------------------------------------------

export const metadataSchema = z.strictObject({
  storageSchemaVersion: z.int(),
  storageInstanceId: uuidSchema,
  /** The sidecar release that last wrote the file. */
  writtenBySidecar: z.string().max(64),
  fabricGeneration: z.int().min(0),
  fabricId: matterId64Schema,
  rootCertFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  /** Node IDs are allocated from here on, so IDs a restored backup may have handed out later are not reused. */
  nodeIdFloor: z.int().min(1).optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type StorageMetadata = z.infer<typeof metadataSchema>;

function fsyncDirectory(directory: string) {
  try {
    const fd = openSync(directory, 'r');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    // Not every platform can fsync a directory; the rename itself is still atomic.
  }
}

/** Writes the metadata through a temporary file and an atomic rename, so a crash leaves the old or the new file. */
export function writeMetadata(layout: StorageLayout, metadata: StorageMetadata, file = layout.metadataFile): void {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, 'w', 0o600);
  try {
    writeSync(fd, `${JSON.stringify(metadata, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  chmodSync(temporary, 0o600);
  renameSync(temporary, file);
  fsyncDirectory(layout.root);
}

// --- matter.js storage facts ----------------------------------------------------------------------

export type FabricFacts = { fabricId: string; rootCertFingerprint: string };

export class StorageProblem extends Error {
  constructor(readonly reason: RecoveryReason) {
    super(reason);
  }
}

/** matter.js stores values as JSON strings that may wrap BigInts and byte arrays in `{__object__, __value__}`. */
function unwrap(raw: string): unknown {
  let value: unknown = JSON.parse(raw);
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      // A plain string.
    }
  }
  return value;
}

const objectValue = (value: unknown, kind: string): string | undefined => {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  const wrapped = value as { __object__?: unknown; __value__?: unknown } | null;
  return wrapped?.__object__ === kind && typeof wrapped.__value__ === 'string' ? wrapped.__value__ : undefined;
};

function readStored(controllerDir: string, key: string): unknown {
  const file = join(controllerDir, key);
  if (!existsSync(file)) throw new StorageProblem('storage_incomplete');
  try {
    return unwrap(readFileSync(file, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES') throw new StorageProblem('storage_unreadable');
    throw new StorageProblem('storage_corrupt');
  }
}

/**
 * Reads the public identity of the fabric from the matter.js files without starting matter.js: the fabric ID and the
 * SHA-256 of the root certificate. Never touches a private key.
 */
export function readFabricFacts(controllerDir: string): FabricFacts {
  const rootHex = objectValue(readStored(controllerDir, 'certificates.rootCertBytes'), 'Uint8Array');
  if (rootHex === undefined || !/^([0-9a-f]{2})+$/.test(rootHex)) throw new StorageProblem('storage_corrupt');
  // The root key must exist as well, or nothing could ever be commissioned again.
  if (!existsSync(join(controllerDir, 'certificates.rootKeyPair'))) throw new StorageProblem('storage_incomplete');
  const fabrics = readStored(controllerDir, 'fabrics.fabrics');
  if (!Array.isArray(fabrics)) throw new StorageProblem('storage_corrupt');
  for (const entry of fabrics as Record<string, unknown>[]) {
    if (objectValue(entry?.rootCert, 'Uint8Array') !== rootHex) continue;
    const fabricId = objectValue(entry.fabricId, 'BigInt');
    if (fabricId === undefined || !matterId64Schema.safeParse(fabricId).success)
      throw new StorageProblem('storage_corrupt');
    return { fabricId, rootCertFingerprint: sha256Hex(Buffer.from(rootHex, 'hex')) };
  }
  throw new StorageProblem('storage_incomplete');
}

/** Number of commissioned peers recorded in the matter.js files. */
export function countPeers(controllerDir: string): number {
  const peers = new Set<string>();
  try {
    for (const name of readdirSync(controllerDir)) {
      const match = /^nodes\.(peer\d+)\./.exec(name);
      if (match) peers.add(match[1]);
    }
  } catch {
    // No controller storage: no peers.
  }
  return peers.size;
}

// --- inspection ----------------------------------------------------------------------------------

export type StorageInspection =
  | { kind: 'uninitialized' }
  | { kind: 'initialized'; metadata: StorageMetadata; facts: FabricFacts }
  | { kind: 'recovery'; reason: RecoveryReason };

const recovery = (reason: RecoveryReason): StorageInspection => ({ kind: 'recovery', reason });

/**
 * Classifies the storage without modifying it. Anything that is not exactly "empty" or "complete and consistent" is a
 * recovery state: the sidecar then leaves the files alone and waits for an administrator.
 */
export function inspectStorage(layout: StorageLayout): StorageInspection {
  let hasMetadata: boolean;
  let hasData: boolean;
  try {
    hasMetadata = existsSync(layout.metadataFile);
    hasData = directoryHasFiles(layout.matterDir) || directoryHasFiles(layout.controllerDir);
  } catch {
    return recovery('storage_unreadable');
  }
  if (!hasMetadata) return hasData ? recovery('metadata_missing') : { kind: 'uninitialized' };
  if (!hasData) return recovery('metadata_orphaned');
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(layout.metadataFile, 'utf8'));
  } catch (error) {
    return recovery((error as NodeJS.ErrnoException).code === 'EACCES' ? 'storage_unreadable' : 'storage_corrupt');
  }
  const version = (parsed as { storageSchemaVersion?: unknown } | null)?.storageSchemaVersion;
  if (typeof version !== 'number') return recovery('storage_corrupt');
  if (version !== STORAGE_SCHEMA_VERSION) return recovery('schema_mismatch');
  const metadata = metadataSchema.safeParse(parsed);
  if (!metadata.success) return recovery('storage_corrupt');
  try {
    const facts = readFabricFacts(layout.controllerDir);
    if (facts.fabricId !== metadata.data.fabricId || facts.rootCertFingerprint !== metadata.data.rootCertFingerprint) {
      return recovery('storage_corrupt');
    }
    return { kind: 'initialized', metadata: metadata.data, facts };
  } catch (error) {
    return recovery(error instanceof StorageProblem ? error.reason : 'storage_unreadable');
  }
}

// --- counters --------------------------------------------------------------------------------------

/** Added to persisted counters on restore: values the sidecar may have used after the backup are never reused. */
export const COUNTER_MARGIN = 1 << 20;
/** Added to the node ID allocator on restore. */
export const NODE_ID_MARGIN = 1_000;

/**
 * A restored snapshot is older than the devices' memory of this controller. Advances the persisted group message
 * counter (a uint32 that wraps) and returns where node IDs may be allocated from.
 */
export function advanceRestoredCounters(controllerDir: string, previousFloor = 1): number {
  const file = join(controllerDir, 'sessions.groupDataCounter');
  if (existsSync(file)) {
    const current = Number(readFileSync(file, 'utf8').trim());
    if (Number.isSafeInteger(current) && current >= 0) {
      writeFileSync(file, String((current + COUNTER_MARGIN) % 2 ** 32), { mode: 0o600 });
    }
  }
  return Math.max(previousFloor, countPeers(controllerDir) + 1) + NODE_ID_MARGIN;
}
