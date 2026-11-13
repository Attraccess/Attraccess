import { STORAGE_SCHEMA_VERSION } from '@attraccess/matter-contract';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArchiveError, packDirectory, sha256Hex, unpackInto } from './archive';
import {
  COUNTER_MARGIN,
  NODE_ID_MARGIN,
  StorageDirError,
  advanceRestoredCounters,
  countPeers,
  ensureStorageDir,
  inspectStorage,
  layoutFor,
  writeMetadata,
} from './storage';
import { gzipSync } from 'node:zlib';

const dirs: string[] = [];
const tmp = () => {
  const directory = mkdtempSync(join(tmpdir(), 'matter-storage-spec-'));
  dirs.push(directory);
  return directory;
};
afterEach(() => {
  for (const directory of dirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const inner = (kind: string, value: string) => JSON.stringify({ __object__: kind, __value__: value });
/** matter.js stores a wrapped value as a JSON string of this JSON. */
const wrap = (kind: string, value: string) => JSON.stringify(inner(kind, value));
const ROOT_HEX = 'aabbccdd';
const FABRIC_ID = '1599354978490731086';

/** A minimal stand-in for what matter.js writes: only the files the sidecar reads. */
function seed(root: string, overrides: { generation?: number } = {}) {
  const layout = layoutFor(root);
  mkdirSync(layout.controllerDir, { recursive: true });
  writeFileSync(join(layout.controllerDir, 'certificates.rootCertBytes'), wrap('Uint8Array', ROOT_HEX));
  writeFileSync(join(layout.controllerDir, 'certificates.rootKeyPair'), '{}');
  writeFileSync(
    join(layout.controllerDir, 'fabrics.fabrics'),
    JSON.stringify([{ fabricId: inner('BigInt', FABRIC_ID), rootCert: inner('Uint8Array', ROOT_HEX) }]),
  );
  const stamp = new Date().toISOString();
  writeMetadata(layout, {
    storageSchemaVersion: STORAGE_SCHEMA_VERSION,
    storageInstanceId: crypto.randomUUID(),
    writtenBySidecar: '0.4.0-alpha.0',
    fabricGeneration: overrides.generation ?? 1,
    fabricId: FABRIC_ID,
    rootCertFingerprint: sha256Hex(Buffer.from(ROOT_HEX, 'hex')),
    createdAt: stamp,
    updatedAt: stamp,
  });
  return layout;
}

describe('ensureStorageDir', () => {
  it('creates the directory owner-only and rejects one that cannot be written, without a stack-worthy error', () => {
    const root = join(tmp(), 'a', 'b');
    ensureStorageDir(root);
    expect(statSync(root).mode & 0o777).toBe(0o700);
    const blocker = join(tmp(), 'file');
    writeFileSync(blocker, 'x');
    expect(() => ensureStorageDir(join(blocker, 'x'))).toThrow(StorageDirError);
    expect(new StorageDirError('x')).toHaveProperty('code');
  });
});

describe('inspectStorage', () => {
  it('reads a consistent storage as initialized without writing anything', () => {
    const layout = seed(tmp());
    const result = inspectStorage(layout);
    expect(result).toMatchObject({ kind: 'initialized', facts: { fabricId: FABRIC_ID } });
  });

  it('treats an empty directory as uninitialized', () => {
    expect(inspectStorage(layoutFor(tmp()))).toEqual({ kind: 'uninitialized' });
  });

  it('reports an unreadable metadata file as corrupt and a wrong type of schema version as corrupt too', () => {
    const layout = seed(tmp());
    writeFileSync(layout.metadataFile, JSON.stringify({ storageSchemaVersion: 'one' }));
    expect(inspectStorage(layout)).toEqual({ kind: 'recovery', reason: 'storage_corrupt' });
    writeFileSync(layout.metadataFile, JSON.stringify({ storageSchemaVersion: STORAGE_SCHEMA_VERSION }));
    expect(inspectStorage(layout)).toEqual({ kind: 'recovery', reason: 'storage_corrupt' });
  });

  it('flags metadata that disagrees with the matter.js files', () => {
    const layout = seed(tmp());
    const metadata = JSON.parse(readFileSync(layout.metadataFile, 'utf8'));
    writeFileSync(layout.metadataFile, JSON.stringify({ ...metadata, fabricId: '2' }));
    expect(inspectStorage(layout)).toEqual({ kind: 'recovery', reason: 'storage_corrupt' });
  });
});

describe('restored counters', () => {
  it('advances the group counter modulo 2^32 and moves the node ID floor past the peers and the margin', () => {
    const layout = seed(tmp());
    writeFileSync(join(layout.controllerDir, 'sessions.groupDataCounter'), String(2 ** 32 - 5));
    writeFileSync(join(layout.controllerDir, 'nodes.peer1.cache'), '1');
    writeFileSync(join(layout.controllerDir, 'nodes.peer2.cache'), '1');
    expect(countPeers(layout.controllerDir)).toBe(2);
    expect(advanceRestoredCounters(layout.controllerDir, 1)).toBe(3 + NODE_ID_MARGIN);
    expect(Number(readFileSync(join(layout.controllerDir, 'sessions.groupDataCounter'), 'utf8'))).toBe(
      (2 ** 32 - 5 + COUNTER_MARGIN) % 2 ** 32,
    );
    expect(advanceRestoredCounters(layout.controllerDir, 5_000)).toBe(5_000 + NODE_ID_MARGIN);
  });
});

describe('archive', () => {
  it('round-trips a tree and extracts owner-only', () => {
    const source = tmp();
    mkdirSync(join(source, 'matter'), { recursive: true });
    writeFileSync(join(source, 'matter', 'a'), 'one');
    writeFileSync(join(source, 'skip'), 'x');
    const target = join(tmp(), 'out');
    unpackInto(packDirectory(source, ['matter']), target);
    expect(readFileSync(join(target, 'matter', 'a'), 'utf8')).toBe('one');
    expect(() => statSync(join(target, 'skip'))).toThrow();
    expect(statSync(join(target, 'matter', 'a')).mode & 0o777).toBe(0o600);
  });

  it.each([['../escape'], ['/abs'], ['a/../../b'], ['a\\b'], ['']])('refuses the unsafe path %j', (path) => {
    const archive = gzipSync(Buffer.from(JSON.stringify({ version: 1, files: [{ path, data: 'AA==' }] })));
    expect(() => unpackInto(archive, join(tmp(), 'out'))).toThrow(ArchiveError);
  });

  it('refuses garbage and an unknown version', () => {
    expect(() => unpackInto(Buffer.from('not gzip'), join(tmp(), 'out'))).toThrow(ArchiveError);
    const archive = gzipSync(Buffer.from(JSON.stringify({ version: 2, files: [] })));
    expect(() => unpackInto(archive, join(tmp(), 'out'))).toThrow(ArchiveError);
  });
});
