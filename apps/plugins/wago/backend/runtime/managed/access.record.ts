/** New enrolments only. Never serialize this entity or its encrypted envelope. */
export interface WagoManagedAccess {
  sessionId: number;
  controllerId: number | null;
  host: string;
  fingerprint: string;
  token: string;
  state: 'pending' | 'verified' | 'managed' | 'recovery_required' | 'retiring' | 'retired';
  encryptedCredentials: string;
  keyFingerprint: string;
}

export interface WagoRuntimeUpdateEntity {
  controllerId: number;
  metadata: string | null;
}

/** Shared by commissioning, managed SSH and updates; keyed by pinned device identity. */
export interface WagoDeviceOperation {
  fingerprint: string;
  owner: string | null;
  leaseUntil: number;
}
