import { randomBytes } from 'node:crypto';

/** Server-only transition seam. Never deserialize an adapter, command, or target from an apply request. */
export type ManagementState =
  | 'inspected'
  | 'reviewed'
  | 'preparing'
  | 'installing_key'
  | 'verifying_key'
  | 'restricting_access'
  | 'verifying_baseline'
  | 'committing'
  | 'key_enrolled'
  | 'hardened'
  | 'recovering'
  | 'recovered'
  | 'recovery_required';

export type ManagementSupport = 'supported' | 'UNSUPPORTED' | 'qualification_required';

export type ManagementException = 'wbm_exposed' | 'other_services_exposed' | 'unqualified_privileges';

export type ManagementMode = 'key_only' | 'baseline';

export type Exposure = 'listening' | 'not_observed' | 'unknown';

export type ManagementFailure = 'inspection_failed' | 'transition_failed' | 'rollback_failed' | null;

export interface ManagementTarget {
  controllerId: number;
  host: string;
  hostKeyFingerprint: string;
}

export interface SessionCredential {
  username: string;
  password: string;
}

export interface ManagementInspection {
  model: 'cc100' | 'unknown';
  firmware: '31' | 'unsupported' | 'unknown';
  ssh: 'openssh' | 'dropbear' | 'mixed' | 'unknown';
  /** Version of this authenticated, pinned SSH peer, never inferred from installed binaries. */
  dropbearVersion?: '2025.88' | 'unknown';
  serviceControl: 'systemd' | 'sysv' | 'unknown';
  uid: number | null;
  wbm: Exposure;
  otherManagement: Exposure;
  /** Socket observations are not firewall, WBM authentication or TLS validation. */
  networkScope: 'local_socket_observation';
  passwordAccess: 'unknown';
  defaultAccess: 'unknown';
}

export interface ManagementQualification {
  support: ManagementSupport;
  /** Fixed identifier from trusted provider code; never a user attestation. */
  evidence:
    | 'openssh-authorized-keys'
    | 'dropbear-2025.88-authorized-keys'
    | 'fw31-qualified-baseline'
    | 'missing-fw31-command-evidence'
    | 'fw31-baseline-not-implemented'
    | 'supported-ssh-nonroot-account-required';
  minimumPrivileges: boolean;
  rebootSafeWatchdog: boolean;
}

export interface ManagementTransaction {
  id: string;
  target: ManagementTarget;
  username: string;
  /** Coordinator clock deadline. Remote adapters must separately persist/enforce a relative timer. */
  deadline: number;
}

export interface ManagementKey {
  privateKey: string;
  publicKey: string;
  fingerprint: string;
}

export interface ManagementKeyProof {
  nonce: string;
  hostKeyFingerprint: string;
  keyFingerprint: string;
  /** NEW connection with only the expected key: no system-agent/password/keyboard-interactive/multiplex fallback. */
  keyOnly: boolean;
  uid: number;
  managementOperationSucceeded: boolean;
}

/** Each method must settle within the supplied timeout. The transport kills timed-out commands.
 * Pin verification happens before authentication/command execution. Never log credentials/output.
 * Only the server-created provider sees execute; no HTTP DTO exposes this interface.
 */
export interface PinnedManagementSsh {
  execute(
    target: ManagementTarget,
    credential: SessionCredential,
    command: string,
    limits: { timeoutMs: number; maxOutputBytes: number },
  ): Promise<string>;
  verifyNewKeyConnection(
    target: ManagementTarget,
    username: string,
    privateKey: string,
    nonce: string,
    limits: { timeoutMs: number; maxOutputBytes: number },
  ): Promise<ManagementKeyProof>;
}

/** Pure, typed platform seam. Implementations are selected in trusted backend code only.
 * prepare captures a durable snapshot; armWatchdog acknowledges an independently running rollback.
 * Keep the original pinned control connection available until commit/rollback. A qualified baseline
 * adapter must also be able to recover after restart using the retained management key.
 * install/restrict/commit must refuse expired, rolled-back or foreign transaction IDs.
 * The built-in additive shell persists a controller boot ID and uptime deadline at prepare,
 * bounds remote mutations with timeout, and retries watchdog lock contention for at most 75s.
 * Exhausted contention or conflicting edits retain the journal for explicit recovery; the
 * persisted deadline continues to reject mutations even after the watchdog process has exited.
 * rollback is idempotent, restores access BEFORE removing the key, and verifies restoration.
 * commit atomically disarms the watchdog but retains the snapshot for explicit recovery.
 */
export interface ManagementAdapter {
  inspect(target: ManagementTarget, credential: SessionCredential): Promise<ManagementInspection>;
  qualify(inspection: ManagementInspection, mode: ManagementMode): ManagementQualification;
  prepare(tx: ManagementTransaction, credential: SessionCredential): Promise<void>;
  armWatchdog(
    tx: ManagementTransaction,
    credential: SessionCredential,
  ): Promise<{ armed: boolean; rebootSafe: boolean }>;
  installKey(tx: ManagementTransaction, credential: SessionCredential, publicKey: string): Promise<void>;
  verifyKey(tx: ManagementTransaction, privateKey: string, nonce: string): Promise<ManagementKeyProof>;
  restrictAccess(tx: ManagementTransaction, credential: SessionCredential, verifiedPrivateKey?: string): Promise<void>;
  /** Qualified providers use the verified key after restrictions, never password fallback. */
  verifyBaseline(
    tx: ManagementTransaction,
    verifiedPrivateKey: string,
  ): Promise<{
    passwordDisabled: boolean;
    defaultAccessDisabled: boolean;
    minimumPrivileges: boolean;
    wbmSecure: boolean;
    otherManagementSecure: boolean;
  }>;
  commit(tx: ManagementTransaction, credential: SessionCredential, verifiedPrivateKey?: string): Promise<void>;
  rollback(tx: ManagementTransaction, credential: SessionCredential, retainedPrivateKey?: string): Promise<void>;
}

export interface ManagementPublicStatus {
  controllerId: number;
  state: ManagementState;
  support: ManagementSupport;
  inspection: ManagementInspection | null;
  mode: ManagementMode | null;
  exceptions: ManagementException[];
  keyFingerprint: string | null;
  reviewToken: string | null;
  failure: ManagementFailure;
  recoveryRequired: boolean;
  hardened: boolean;
}

/** Repository-only record. Ciphertext must NEVER be serialized as public status. */
export interface ManagementRecord {
  target: ManagementTarget;
  state: ManagementState;
  inspection: ManagementInspection | null;
  mode: ManagementMode | null;
  exceptions: ManagementException[];
  support: ManagementSupport;
  reviewToken: string | null;
  reviewedAt: number | null;
  transaction: ManagementTransaction | null;
  keyFingerprint: string | null;
  encryptedPrivateKey: string | null;
  failure: ManagementFailure;
}

export interface ManagementStore {
  load(controllerId: number): Promise<ManagementRecord | null>;
  /** Atomic cross-process lease. No takeover before expiry; every writer requires the owner token. */
  acquire(controllerId: number, owner: string, now: number, until: number): Promise<boolean>;
  save(controllerId: number, owner: string, record: ManagementRecord, now: number): Promise<void>;
  release(controllerId: number, owner: string): Promise<void>;
}

export class ManagementError extends Error {
  constructor(
    readonly code:
      | 'invalid_request'
      | 'credentials_required'
      | 'busy'
      | 'inspect_required'
      | 'review_required'
      | 'qualification_required'
      | 'UNSUPPORTED'
      | 'recovery_required'
      | 'operation_failed',
  ) {
    super(code);
  }
}

export { WagoManagementService as WagoManagementServiceEnforceBaselineOperation } from './service';

export { WagoManagementService as WagoManagementServiceInspectOperation } from './service';

export { WagoManagementService as WagoManagementServiceLockedOperation } from './service';

export { WagoManagementService as WagoManagementServiceRecoverOperation } from './service';

export const exceptionNames: ManagementException[] = [
  'wbm_exposed',
  'other_services_exposed',
  'unqualified_privileges',
];

export const identifier = () => randomBytes(16).toString('hex');

export const LEASE_MS = 300000;

export const transitionStates: ManagementState[] = [
  'preparing',
  'installing_key',
  'verifying_key',
  'restricting_access',
  'verifying_baseline',
  'committing',
  'recovering',
  'recovery_required',
];

export function pick<T extends string>(value: T, options: readonly T[]): T {
  if (!options.includes(value)) throw new ManagementError('operation_failed');
  return value;
}

export /** Structural allowlist: discard even unexpected extra adapter properties rather than spreading them. */
function cleanInspection(value: ManagementInspection): ManagementInspection {
  if (value.uid !== null && (!Number.isSafeInteger(value.uid) || value.uid < 0 || value.uid > 4294967294))
    throw new ManagementError('operation_failed');
  return {
    model: pick(value.model, ['cc100', 'unknown']),
    firmware: pick(value.firmware, ['31', 'unsupported', 'unknown']),
    ssh: pick(value.ssh, ['openssh', 'dropbear', 'mixed', 'unknown']),
    dropbearVersion: pick(value.dropbearVersion ?? 'unknown', ['2025.88', 'unknown']),
    serviceControl: pick(value.serviceControl, ['systemd', 'sysv', 'unknown']),
    uid: value.uid,
    wbm: pick(value.wbm, ['listening', 'not_observed', 'unknown']),
    otherManagement: pick(value.otherManagement, ['listening', 'not_observed', 'unknown']),
    networkScope: 'local_socket_observation',
    passwordAccess: 'unknown',
    defaultAccess: 'unknown',
  };
}

export function exactKeys(input: object, keys: string[]): void {
  if (
    !input ||
    typeof input !== 'object' ||
    Object.keys(input).length !== keys.length ||
    Object.keys(input).some((key) => !keys.includes(key))
  )
    throw new ManagementError('invalid_request');
}

export function publicStatus(record: ManagementRecord): ManagementPublicStatus {
  return {
    controllerId: record.target.controllerId,
    state: pick(record.state, [...transitionStates, 'inspected', 'reviewed', 'key_enrolled', 'hardened', 'recovered']),
    support: pick(record.support, ['supported', 'UNSUPPORTED', 'qualification_required']),
    inspection: record.inspection ? cleanInspection(record.inspection) : null,
    mode: record.mode === null ? null : pick(record.mode, ['baseline', 'key_only']),
    exceptions: record.exceptions.filter((value) => exceptionNames.includes(value)).slice(0, 3),
    keyFingerprint:
      record.keyFingerprint && /^SHA256:[A-Za-z0-9+/]{43}$/.test(record.keyFingerprint) ? record.keyFingerprint : null,
    reviewToken: record.reviewToken && /^[a-f0-9]{32}$/.test(record.reviewToken) ? record.reviewToken : null,
    failure:
      record.failure === null
        ? null
        : pick(record.failure, ['inspection_failed', 'transition_failed', 'rollback_failed']),
    recoveryRequired: transitionStates.includes(record.state),
    hardened: record.state === 'hardened' && record.support === 'supported' && record.exceptions.length === 0,
  };
}

export function validId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0) throw new ManagementError('invalid_request');
}

export function validateCredential(credential: SessionCredential): void {
  if (
    !credential ||
    typeof credential.username !== 'string' ||
    !/^[a-z_][a-z0-9_-]{0,31}$/.test(credential.username) ||
    typeof credential.password !== 'string' ||
    credential.password.length < 1 ||
    credential.password.length > 4096 ||
    /[\0\r\n]/.test(credential.password)
  )
    throw new ManagementError('credentials_required');
  exactKeys(credential, ['username', 'password']);
}

export function validateTarget(target: ManagementTarget): void {
  validId(target.controllerId);
  const octets = typeof target.host === 'string' && target.host.split('.');
  if (
    !octets ||
    octets.length !== 4 ||
    octets.some((value) => !/^(0|[1-9]\d{0,2})$/.test(value) || Number(value) > 255)
  )
    throw new ManagementError('invalid_request');
  const [a, b] = octets.map(Number);
  if (
    !(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) ||
    !/^SHA256:[A-Za-z0-9+/]{43}$/.test(target.hostKeyFingerprint)
  )
    throw new ManagementError('invalid_request');
}

export type ManagementOwner = { id: string; assertOwned: () => Promise<void> };
