import { STORAGE_SCHEMA_VERSION, type BackupHeader } from '@attraccess/matter-contract';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError } from '../api-error';
import { ArchiveError, packDirectory, sha256Hex, unpackInto } from './archive';
import {
  layoutFor,
  metadataSchema,
  readFabricFacts,
  type FabricFacts,
  type StorageInspection,
  type StorageLayout,
  type StorageMetadata,
} from './storage';

/** What a stage holds, as reported to the plugin before it commits. */
export type StageSummary = {
  stageId: string;
  fabricId: string;
  rootCertFingerprint: string;
  fabricGeneration: number;
  storageInstanceId: string;
  expiresAt: string;
};

const matterMinor = (version: string) => version.split('.').slice(0, 2).join('.');
const invalid = (message: string, code: string) => new ApiError('invalid_backup', message, { code });

/** Packs the live storage into a backup. matter.js writes while it runs, so its controller must be closed. */
export function packSnapshot(
  layout: StorageLayout,
  current: Extract<StorageInspection, { kind: 'initialized' }>,
  versions: { sidecar: string; matterJs: string },
  createdAt: string,
): { header: BackupHeader; payload: string } {
  const archive = packDirectory(layout.root, ['matter', 'sidecar-metadata.json']);
  const { metadata } = current;
  const header: BackupHeader = {
    storageSchemaVersion: metadata.storageSchemaVersion,
    sidecarVersion: versions.sidecar,
    matterJsVersion: versions.matterJs,
    fabricId: metadata.fabricId,
    rootCertFingerprint: metadata.rootCertFingerprint,
    fabricGeneration: metadata.fabricGeneration,
    storageInstanceId: metadata.storageInstanceId,
    payloadSha256: sha256Hex(archive),
    payloadBytes: archive.length,
    createdAt,
  };
  return { header, payload: archive.toString('base64') };
}

/**
 * Checks a backup against this sidecar and unpacks it into a new directory of the staging area. Any earlier stage must
 * already be discarded: on failure the whole staging area is removed.
 */
export function unpackStage(
  layout: StorageLayout,
  header: BackupHeader,
  payload: string,
  matterJsVersion: string,
): { stageId: string; directory: string } {
  if (header.storageSchemaVersion !== STORAGE_SCHEMA_VERSION) {
    throw invalid('The backup uses a different storage schema version.', 'incompatible_schema');
  }
  if (matterMinor(header.matterJsVersion) !== matterMinor(matterJsVersion)) {
    throw invalid('The backup was made with an incompatible matter.js release.', 'incompatible_matter_js');
  }
  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length !== header.payloadBytes || sha256Hex(bytes) !== header.payloadSha256) {
    throw invalid('The snapshot is corrupt or incomplete.', 'corrupt');
  }
  const stageId = randomUUID();
  const directory = join(layout.stagingDir, stageId);
  try {
    mkdirSync(layout.stagingDir, { recursive: true, mode: 0o700 });
    unpackInto(bytes, directory);
    checkStaged(directory, header);
  } catch (error) {
    // Any earlier stage was discarded by the caller, so nothing else lives in the staging area.
    rmSync(layout.stagingDir, { recursive: true, force: true });
    if (error instanceof ApiError) throw error;
    throw invalid(error instanceof ArchiveError ? error.message : 'The snapshot is corrupt or incomplete.', 'corrupt');
  }
  return { stageId, directory };
}

/** The unpacked snapshot must really contain the fabric its header claims. */
function checkStaged(directory: string, header: BackupHeader) {
  const corrupt = () => invalid('The snapshot content does not match its header.', 'corrupt');
  const layout = layoutFor(directory);
  let metadata: StorageMetadata;
  try {
    const parsed = metadataSchema.safeParse(JSON.parse(readFileSync(layout.metadataFile, 'utf8')));
    if (!parsed.success) throw corrupt();
    metadata = parsed.data;
  } catch {
    throw corrupt();
  }
  if (metadata.storageSchemaVersion !== STORAGE_SCHEMA_VERSION) {
    throw invalid('The backup uses a different storage schema version.', 'incompatible_schema');
  }
  let facts: FabricFacts;
  try {
    facts = readFabricFacts(layout.controllerDir);
  } catch {
    throw corrupt();
  }
  if (
    facts.fabricId !== header.fabricId ||
    facts.rootCertFingerprint !== header.rootCertFingerprint ||
    metadata.fabricId !== header.fabricId ||
    metadata.rootCertFingerprint !== header.rootCertFingerprint ||
    metadata.fabricGeneration !== header.fabricGeneration ||
    metadata.storageInstanceId !== header.storageInstanceId
  ) {
    throw corrupt();
  }
}
