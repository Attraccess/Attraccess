// REST access for the fabric & backup section (`/api/matter/*`, guarded by the Matter keys, see backend/permissions.ts).
import { MatterApiError, matterApiClient, matterRequest, toMatterApiError } from '../matterApi';

export type SidecarFabricState = 'uninitialized' | 'initialized' | 'recovery_required' | 'unknown';
export type RecoveryMismatch =
  | 'sidecar_uninitialized'
  | 'fabric_changed'
  | 'generation_behind'
  | 'generation_ahead'
  | 'storage_instance_changed'
  | 'sidecar_recovery_required';
export type BackupTrigger = 'manual' | 'fabric_created' | 'restore' | 'daily' | 'fabric_changed' | 'pre_restore';

export interface FabricFacts {
  fabricId: string | null;
  rootCertFingerprint: string | null;
  fabricGeneration: number | null;
  storageInstanceId: string | null;
}

export interface BackupView {
  id: string;
  createdAt: string;
  trigger: BackupTrigger;
  actor: string | null;
  sizeBytes: number;
  sha256: string;
  outcome: 'succeeded';
  fabricId: string;
  fabricGeneration: number;
  recoveryKeyId: string;
  /** False for a backup taken while the plugin and the sidecar disagreed (a pre-restore backup in recovery). */
  consistent: boolean;
}

export interface FabricBackupStatus {
  sidecar: FabricFacts & { reachable: boolean; state: SidecarFabricState; reason: string | null };
  recorded: FabricFacts | null;
  recovery: { required: boolean; mismatch: RecoveryMismatch | null };
  recoveryKey: { present: boolean; keyId: string | null; createdAt: string | null; acknowledged: boolean };
  backups: {
    lastSuccessfulAt: string | null;
    lastAttempt: { at: string; outcome: 'succeeded' | 'failed'; trigger: BackupTrigger; reason: string | null } | null;
    nextScheduledAt: string | null;
    retention: number;
    stored: BackupView[];
  };
  actions: {
    canCreateFabric: boolean;
    canBackup: boolean;
    canRestore: boolean;
    canAcceptSidecar: boolean;
    canStartNew: boolean;
  };
}

/** Shown exactly once; never kept in a cache. */
export interface RecoveryKeyReveal {
  keyId: string;
  key: string;
  createdAt: string;
}

export type RestoreSource = { type: 'stored'; backupId: string } | { type: 'upload'; contentBase64: string };

export interface RestoreValidation {
  validationId: string;
  expiresAt: string;
  backup: {
    backupId: string;
    createdAt: string;
    pluginVersion: string;
    sidecarVersion: string;
    fabricId: string;
    rootCertFingerprint: string;
    fabricGeneration: number;
    recoveryKeyId: string;
    consistent: boolean;
  };
  preflight: {
    sidecarState: 'uninitialized' | 'recovery_required' | 'initialized';
    kind: 'plain' | 'rollback' | 'replacement';
    currentFabricId: string | null;
    requiresTypedConfirmation: boolean;
    confirmationFabricId: string | null;
  };
}

export interface RestoreResult {
  outcome: 'succeeded';
  status: FabricBackupStatus;
}

const call = <T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) => matterRequest<T>(method, path, body);

export const getFabricStatus = () => call<FabricBackupStatus>('/fabric');
export const createFabric = () =>
  call<{ status: FabricBackupStatus; recoveryKey: RecoveryKeyReveal | null }>('/fabric/create', 'POST', {});
export const generateRecoveryKey = () => call<RecoveryKeyReveal>('/fabric/recovery-key', 'POST', {});
export const acknowledgeRecoveryKey = (keyId: string) =>
  call<FabricBackupStatus>('/fabric/recovery-key/acknowledge', 'POST', { keyId });
export const rotateRecoveryKey = () =>
  call<RecoveryKeyReveal>('/fabric/recovery-key/rotate', 'POST', { confirm: true });
export const backUpNow = () => call<BackupView>('/backups', 'POST', {});
export const validateRestore = (source: RestoreSource, recoveryKey?: string) =>
  call<RestoreValidation>('/restore/validate', 'POST', { source, ...(recoveryKey ? { recoveryKey } : {}) });
export const confirmRestore = (validationId: string, confirmFabricId?: string) =>
  call<RestoreResult>('/restore/confirm', 'POST', { validationId, ...(confirmFabricId ? { confirmFabricId } : {}) });
export const cancelRestore = (validationId: string) =>
  call<unknown>(`/restore/${encodeURIComponent(validationId)}/cancel`, 'POST', {});
export const acceptSidecarFabric = () =>
  call<FabricBackupStatus>('/recovery/accept-sidecar', 'POST', { confirm: true });
export const startNewFabric = () =>
  call<{ status: FabricBackupStatus; recoveryKey: RecoveryKeyReveal | null }>('/recovery/start-new', 'POST', {
    confirm: true,
  });

/** Downloads the encrypted backup file through the authenticated session and hands it to the browser. */
export async function downloadBackup(id: string): Promise<void> {
  const response = await matterApiClient.fetch(`/backups/${encodeURIComponent(id)}/download`);
  if (!response.ok) throw await toMatterApiError(response);
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? `attraccess-matter-${id}.attraccess-matter-backup`;
  saveBlob(await response.blob(), filename);
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Reads a file as base64 (without the data-URL prefix). */
export function readFileAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new MatterApiError('', 0, 'file_unreadable'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}
