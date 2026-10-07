import { CommissioningManagementRefresh } from './wago-commissioning-accept';
export type Credentials = {
  sessionId: number;
  host: string;
  hardwareId: string;
  fingerprint: string;
  token: string;
  privateKey: string;
  recoveryPassword: string;
  installerPrivateKey: string;
};
export type LiveHeartbeat = {
  runtimeVersion?: string;
  imageId: string;
  streamId: string;
  timestamp: number;
  receivedAt: number;
  runtimePolicyToken?: string;
};
export type ManagementSetupReason =
  | 'session'
  | 'server_setup'
  | 'connection'
  | 'runtime_state'
  | 'enrollment_credentials'
  | 'configuration'
  | 'readiness';

export type ManagementSetup =
  | { state: 'waiting'; reason: ManagementSetupReason | 'scheduled' }
  | { state: 'running'; reason: 'preparation' | 'ssh_cutover' | 'reboot' | 'confirmation' };

export type RootAcceptance = (
  host: string,
  fingerprint: string,
  password: string,
  token: string,
  guard: import('./wago-operation-guard').CommissioningOperationGuard,
  management: CommissioningManagementRefresh,
) => Promise<void>;
export type RootProbe = (host: string, fingerprint: string, password: string) => Promise<boolean>;
