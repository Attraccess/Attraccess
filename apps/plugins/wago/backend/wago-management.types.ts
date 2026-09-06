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
  evidence: 'openssh-authorized-keys' | 'fw31-qualified-baseline' | 'missing-fw31-command-evidence';
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
