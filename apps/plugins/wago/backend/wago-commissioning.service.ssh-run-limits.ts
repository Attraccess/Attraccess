import {
  type CommissioningCheckpoint,
} from './wago-commissioning-progress';
export type SshRunLimits = {
  timeoutMs: number;
  maxOutputBytes: number;
  storageDiagnostic?: boolean;
  lockDiagnostic?: boolean;
  managementDiagnostic?: boolean;
  recoveryDiagnostic?: boolean;
  onProgress?: (checkpoint: CommissioningCheckpoint) => void;
};
