import { type z } from 'zod';
import { attestationStatusSchema, timestampSchema } from '@attraccess/matter-contract';
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StorageLayout } from '../fabric/storage';

export type AttestationRecord = {
  status: z.infer<typeof attestationStatusSchema>;
  checkedAt: z.infer<typeof timestampSchema> | null;
};

/**
 * What the sidecar knows about a node that the device itself cannot tell: the outcome of the attestation done while
 * commissioning. Commissioning records it; `inventory.*` reads it.
 *
 * The file lives at the root of the matter.js storage directory (`<storage>/matter/`), next to, not inside, the
 * `controller` store matter.js owns. That directory is what a backup packs and a restore swaps in, so the record
 * travels with the fabric. A node that has no record (commissioned before this release, or restored from an older
 * backup) reports `unknown`, never `verified`.
 */
const FILE = 'attraccess-node-meta.json';
const EMPTY: AttestationRecord = { status: 'unknown', checkedAt: null };

type Store = { version: 1; attestation: Record<string, AttestationRecord> };

const fileOf = (layout: StorageLayout) => join(layout.matterDir, FILE);

function load(layout: StorageLayout): Store {
  const file = fileOf(layout);
  if (!existsSync(file)) return { version: 1, attestation: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<Store>;
    if (parsed.version === 1 && parsed.attestation && typeof parsed.attestation === 'object') {
      return { version: 1, attestation: parsed.attestation };
    }
  } catch {
    // An unreadable file only costs the attestation records; the nodes themselves live in matter.js storage.
  }
  return { version: 1, attestation: {} };
}

function save(layout: StorageLayout, store: Store): void {
  const file = fileOf(layout);
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, JSON.stringify(store), { mode: 0o600 });
  const fd = openSync(temporary, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, file);
}

export function recordAttestation(layout: StorageLayout, nodeId: string, record: AttestationRecord): void {
  const store = load(layout);
  store.attestation[nodeId] = record;
  save(layout, store);
}

export function readAttestation(layout: StorageLayout, nodeId: string): AttestationRecord {
  return load(layout).attestation[nodeId] ?? EMPTY;
}

/** Reads the file once, for a whole list: the lookup answers every node from that one read. */
export function readAttestations(layout: StorageLayout): (nodeId: string) => AttestationRecord {
  const { attestation } = load(layout);
  return (nodeId) => (Object.hasOwn(attestation, nodeId) ? attestation[nodeId] : EMPTY);
}

/** Drops what is recorded about a node that left the fabric, so a reused node ID never inherits it. */
export function forgetNodeMeta(layout: StorageLayout, nodeId: string): void {
  const store = load(layout);
  if (!(nodeId in store.attestation)) return;
  delete store.attestation[nodeId];
  if (Object.keys(store.attestation).length === 0) rmSync(fileOf(layout), { force: true });
  else save(layout, store);
}
