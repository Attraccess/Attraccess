import type { FabricBackupStatus } from '../fabric/fabric.service';
import type { BackupBody, FileHeader } from './format';

export type RestoreSource = { type: 'stored'; backupId: string } | { type: 'upload'; contentBase64: string };

export type RestoreValidationCode =
  | 'key_required'
  | 'wrong_key'
  | 'corrupt'
  | 'truncated'
  | 'incompatible_format'
  | 'incompatible_schema'
  | 'incompatible_migration'
  | 'incompatible_version'
  | 'stage_failed'
  | 'insecure_transport'
  | 'sidecar_unavailable';

export type RestorePreflight = {
  sidecarState: 'uninitialized' | 'recovery_required' | 'initialized';
  /** `plain`: nothing healthy is replaced; `rollback`: the same fabric at an earlier point; `replacement`: another one. */
  kind: 'plain' | 'rollback' | 'replacement';
  currentFabricId: string | null;
  requiresTypedConfirmation: boolean;
  /** The healthy fabric's ID the administrator must type to confirm overwriting it. */
  confirmationFabricId: string | null;
};

export type RestoreValidation = {
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
    /**
     * False for a backup whose plugin tables did not agree with its sidecar snapshot (a pre-restore backup taken in
     * recovery): restoring it brings that mismatch back, and the plugin asks for recovery again afterwards.
     */
    consistent: boolean;
  };
  preflight: RestorePreflight;
};

export type RestoreResult = { outcome: 'succeeded'; status: FabricBackupStatus };

/** A validated backup staged on the sidecar, waiting for its confirmation. */
export type Pending = {
  validationId: string;
  userId: number;
  header: FileHeader;
  body: BackupBody;
  /** The key the administrator typed in, kept until the restore so a disaster recovery can keep it. */
  suppliedKey: Buffer | null;
  stageId: string;
  preflight: RestorePreflight;
  timer: NodeJS.Timeout;
};

export const RESTORE_MESSAGES: Record<RestoreValidationCode, string> = {
  key_required: 'This backup was encrypted with a recovery key that this installation does not have. Enter it.',
  wrong_key: 'The recovery key does not match this backup.',
  corrupt: 'The backup is damaged or has been modified.',
  truncated: 'The backup file is incomplete.',
  incompatible_format: 'This is not a backup this version can read.',
  incompatible_schema: 'The backup uses a different Matter storage layout than this installation.',
  incompatible_migration: 'The backup was made with a different database layout of the Matter plugin.',
  incompatible_version:
    'The backup was made with a release combination of the Matter plugin and sidecar that is not supported.',
  stage_failed: 'The Matter sidecar did not accept the backup.',
  insecure_transport:
    'The connection to the Matter sidecar is plain HTTP to another machine. Restores carry fabric secrets and need HTTPS.',
  sidecar_unavailable: 'The Matter sidecar could not be reached.',
};

export const LEFT_UNCHANGED = 'Your installation was left unchanged.';
