import { STORAGE_SCHEMA_VERSION } from '@attraccess/matter-contract';
import type { FabricFacts, SidecarFabric } from './facts';
import { detectMismatch } from './mismatch';

const recorded: FabricFacts = {
  fabricId: '10',
  rootCertFingerprint: 'a'.repeat(64),
  storageInstanceId: '00000000-0000-4000-8000-000000000001',
  fabricGeneration: 5,
};
const sidecar = (overrides: Partial<SidecarFabric> = {}): SidecarFabric => ({
  state: 'initialized',
  reason: null,
  fabricId: recorded.fabricId,
  fabricGeneration: recorded.fabricGeneration,
  rootCertFingerprint: recorded.rootCertFingerprint,
  storageInstanceId: recorded.storageInstanceId,
  storageSchemaVersion: STORAGE_SCHEMA_VERSION,
  ...overrides,
});

describe('fabric mismatch matrix', () => {
  it.each([
    ['everything matches', sidecar(), recorded, { kind: null, adopt: null }],
    [
      'uninitialized sidecar, nothing recorded',
      sidecar({
        state: 'uninitialized',
        fabricId: null,
        rootCertFingerprint: null,
        storageInstanceId: null,
        fabricGeneration: 0,
      }),
      null,
      { kind: null, adopt: null },
    ],
    [
      'uninitialized sidecar while the plugin has a fabric',
      sidecar({
        state: 'uninitialized',
        fabricId: null,
        rootCertFingerprint: null,
        storageInstanceId: null,
        fabricGeneration: 0,
      }),
      recorded,
      { kind: 'sidecar_uninitialized' },
    ],
    ['a different fabric ID', sidecar({ fabricId: '11' }), recorded, { kind: 'fabric_changed' }],
    [
      'a different root certificate',
      sidecar({ rootCertFingerprint: 'b'.repeat(64) }),
      recorded,
      { kind: 'fabric_changed' },
    ],
    [
      'a different storage instance',
      sidecar({ storageInstanceId: '00000000-0000-4000-8000-000000000002' }),
      recorded,
      { kind: 'storage_instance_changed' },
    ],
    [
      'a sidecar generation behind the record',
      sidecar({ fabricGeneration: 4 }),
      recorded,
      { kind: 'generation_behind' },
    ],
    [
      'a sidecar generation ahead of the record',
      sidecar({ fabricGeneration: 6 }),
      recorded,
      { kind: 'generation_ahead' },
    ],
    [
      'a sidecar in recovery',
      sidecar({
        state: 'recovery_required',
        reason: 'storage_corrupt',
        fabricId: null,
        rootCertFingerprint: null,
        storageInstanceId: null,
      }),
      recorded,
      { kind: 'sidecar_recovery_required' },
    ],
    [
      'a sidecar in recovery, nothing recorded',
      sidecar({
        state: 'recovery_required',
        reason: 'storage_corrupt',
        fabricId: null,
        rootCertFingerprint: null,
        storageInstanceId: null,
      }),
      null,
      { kind: 'sidecar_recovery_required' },
    ],
  ])('%s', (_name, status, record, expected) => {
    expect(detectMismatch(status, record)).toEqual(expected);
  });

  it('adopts the sidecar fabric when the plugin has recorded nothing', () => {
    expect(detectMismatch(sidecar(), null)).toEqual({ kind: null, adopt: recorded });
  });

  it('checks the fabric identity before the storage instance and the generation', () => {
    expect(
      detectMismatch(
        sidecar({ fabricId: '11', storageInstanceId: '00000000-0000-4000-8000-000000000002', fabricGeneration: 1 }),
        recorded,
      ),
    ).toEqual({ kind: 'fabric_changed' });
  });
});
