import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layoutFor } from '../fabric/storage';
import { forgetNodeMeta, readAttestation, recordAttestation } from './node-meta';

describe('node metadata', () => {
  let root: string;
  const layout = () => layoutFor(root);
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'matter-meta-'));
    mkdirSync(layout().matterDir, { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reports unknown for a node without a record', () => {
    expect(readAttestation(layout(), '1')).toEqual({ status: 'unknown', checkedAt: null });
  });

  it('keeps the attestation per node next to, not inside, the controller store', () => {
    const checkedAt = '2026-11-20T10:00:00.000Z';
    recordAttestation(layout(), '1', { status: 'verified', checkedAt });
    recordAttestation(layout(), '2', { status: 'unverified', checkedAt });
    expect(readAttestation(layout(), '1')).toEqual({ status: 'verified', checkedAt });
    expect(readAttestation(layout(), '2').status).toBe('unverified');
    expect(readdirSync(layout().matterDir)).toEqual(['attraccess-node-meta.json']);
  });

  it('forgets a node and removes the file with its last record', () => {
    recordAttestation(layout(), '1', { status: 'verified', checkedAt: null });
    recordAttestation(layout(), '2', { status: 'verified', checkedAt: null });
    forgetNodeMeta(layout(), '1');
    expect(readAttestation(layout(), '1').status).toBe('unknown');
    forgetNodeMeta(layout(), '2');
    expect(readdirSync(layout().matterDir)).toEqual([]);
    expect(() => forgetNodeMeta(layout(), '2')).not.toThrow();
  });

  it('treats an unreadable file as no records', () => {
    writeFileSync(join(layout().matterDir, 'attraccess-node-meta.json'), '{not json');
    expect(readAttestation(layout(), '1').status).toBe('unknown');
    recordAttestation(layout(), '1', { status: 'verified', checkedAt: null });
    expect(readAttestation(layout(), '1').status).toBe('verified');
  });
});
