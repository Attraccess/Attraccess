export type RuntimeUpdatePhase =
  | 'blocked'
  | 'preparing'
  | 'staging'
  | 'activating'
  | 'verifying'
  | 'accepting'
  | 'recovering'
  | 'recovery_required'
  | 'failed'
  | 'current';

export type RuntimeUpdateFailure =
  | 'management_required'
  | 'offline'
  | 'incompatible'
  | 'storage'
  | 'host_gate'
  | 'release_changed'
  | 'transfer'
  | 'transfer_size'
  | 'transfer_checksum'
  | 'transfer_timeout'
  | 'receiver_tools'
  | 'load'
  | 'readiness'
  | 'interrupted'
  | 'recovery'
  | 'host_identity'
  | 'authentication'
  | 'ssh_agent'
  | 'lock_tools'
  | 'audit'
  | 'runtime_assets'
  | 'codesys_active'
  | 'codesys_boot_enabled'
  | 'io_unavailable'
  | 'writer_conflict';

export interface RuntimeStorageDiagnostic {
  path: string;
  requiredKiB: number;
  availableKiB: number;
}

/** Public and durable metadata contains no SSH/MQTT credentials or raw transport errors. */
export interface RuntimeUpdateRecord {
  controllerId: number;
  phase: RuntimeUpdatePhase;
  token: string | null;
  desiredImageId: string;
  desiredRuntimeVersion?: string;
  previousRuntimeVersion?: string | null;
  desiredDigest: string;
  buildId: string;
  installerSha256?: string;
  previousImageId: string | null;
  attempt: number;
  startedAt: number;
  updatedAt: number;
  retryAt: number;
  failure: RuntimeUpdateFailure | null;
  /** Only validated capacity figures, never raw SSH output. */
  storageDiagnostics?: RuntimeStorageDiagnostic[];
  /** Independent cleanup backoff preserves the accepted rollout and its receipt. */
  cleanupAttempt?: number;
  cleanupRetryAt?: number;
}

export interface RuntimeUpdateStore {
  /** The same controller operation lease must serialize commissioning and management transitions. */
  acquire(controllerId: number, owner: string, now: number, until: number): Promise<boolean>;
  load(controllerId: number): Promise<RuntimeUpdateRecord | null>;
  save(record: RuntimeUpdateRecord, owner: string, now: number): Promise<void>;
  release(controllerId: number, owner: string): Promise<void>;
}

export interface RuntimeUpdateInspection {
  imageId: string;
  runtimeVersion?: string;
  /** Observed under pinned SSH, not inferred from the semver in a heartbeat. */
  managed: boolean;
  claimed: boolean;
  compatible: boolean;
  online: boolean;
}

import type { BuildRuntimeArtifact } from './wago-build-runtime';

/** Privileged host transaction seam. Implementations must use a fixed scoped host
 * helper, take install.lock, verify host ownership/CODESYS/storage, retain a durable
 * token journal across reboot, and preserve runtime.env, CA and enrolled state.
 * A stage or activate retry MUST NOT delete/replace another token's journal.
 * Recovery returns only after the prior runtime passes the host gate; acceptance
 * and recovery retain idempotent receipts until server acknowledgement.
 * No method may outlive its bounded signal/deadline. No bootstrap passwords here.
 */
export interface ManagedRuntimeUpdateHost {
  inspect(controllerId: number, signal: AbortSignal): Promise<RuntimeUpdateInspection>;
  /** Publish the authenticated build installer only after durable intent and audit. */
  prepare?(controllerId: number, artifact: BuildRuntimeArtifact, signal: AbortSignal): Promise<void>;
  stage(controllerId: number, token: string, artifact: BuildRuntimeArtifact, signal: AbortSignal): Promise<void>;
  activate(controllerId: number, token: string, artifact: BuildRuntimeArtifact, signal: AbortSignal): Promise<void>;
  verify(
    controllerId: number,
    token: string | null,
    imageId: string,
    since: number,
    signal: AbortSignal,
  ): Promise<{
    imageId: string;
    /** Fresh permanent heartbeat AND readiness from the same new boot, not retained MQTT. */
    observedAt: number;
    permanent: boolean;
    ready: boolean;
  }>;
  accept(controllerId: number, token: string, signal: AbortSignal): Promise<void>;
  /** Only after the server durably recorded current; discard retained rollback data. */
  acknowledge(controllerId: number, token: string, signal: AbortSignal): Promise<void>;
  recover(controllerId: number, token: string, previousImageId: string, signal: AbortSignal): Promise<void>;
}
