import type { FabricFacts, SidecarFabric } from './facts';

/** Why the plugin's records and the sidecar's fabric no longer fit together. */
export const MISMATCH_KINDS = [
  'sidecar_uninitialized',
  'fabric_changed',
  'generation_behind',
  'generation_ahead',
  'storage_instance_changed',
  'sidecar_recovery_required',
] as const;
export type MismatchKind = (typeof MISMATCH_KINDS)[number];

export type Detection =
  | { kind: MismatchKind; adopt?: undefined }
  /** `adopt`: the plugin has recorded nothing yet and the sidecar has a fabric, so the sidecar's facts are recorded. */
  | { kind: null; adopt: FabricFacts | null };

/**
 * The mismatch matrix. Pure: the sidecar's fabric status against what the plugin recorded. Nothing here ever picks a
 * side: any mismatch needs an administrator, and the plugin never creates, restores or overwrites on its own.
 */
export function detectMismatch(sidecar: SidecarFabric, recorded: FabricFacts | null): Detection {
  if (sidecar.state === 'recovery_required') return { kind: 'sidecar_recovery_required' };
  if (sidecar.state === 'uninitialized') {
    return recorded ? { kind: 'sidecar_uninitialized' } : { kind: null, adopt: null };
  }
  const { fabricId, rootCertFingerprint, storageInstanceId, fabricGeneration } = sidecar;
  if (fabricId === null || rootCertFingerprint === null || storageInstanceId === null) {
    // An initialized fabric without identity cannot be compared: treat it as a sidecar that needs recovery.
    return { kind: 'sidecar_recovery_required' };
  }
  if (!recorded) return { kind: null, adopt: { fabricId, rootCertFingerprint, storageInstanceId, fabricGeneration } };
  if (recorded.fabricId !== fabricId || recorded.rootCertFingerprint !== rootCertFingerprint) {
    return { kind: 'fabric_changed' };
  }
  if (recorded.storageInstanceId !== storageInstanceId) return { kind: 'storage_instance_changed' };
  if (fabricGeneration < recorded.fabricGeneration) return { kind: 'generation_behind' };
  if (fabricGeneration > recorded.fabricGeneration) return { kind: 'generation_ahead' };
  return { kind: null, adopt: null };
}
