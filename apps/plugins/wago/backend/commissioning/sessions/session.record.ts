export type WagoCommissioningState =
  | 'awaiting_delivery'
  | 'delivering'
  | 'awaiting_identity_confirmation'
  | 'awaiting_codesys_confirmation'
  | 'delivery_failed'
  | 'awaiting_discovery'
  | 'awaiting_claim'
  | 'awaiting_verification'
  | 'claim_interrupted'
  | 'recovery_revocation_pending'
  | 'completed'
  | 'revoked';

export interface WagoCommissioningSession {
  id: number;
  hardwareId: string;
  mqttServerId: number;
  targetHost: string;
  hostKeyFingerprint: string;
  firmwareBaseline: string;
  controllerName: string | null;
  state: WagoCommissioningState;
  enrollmentExpiresAt: string | null;
  enrollmentId: number | null;
  pairingCode: string | null;
  deliveryToken: string | null;
  initiatingPrincipal: string | null;
  /** Last attempted delivery's digest for observation only; never used to choose the next bundle. */
  runtimeArtifactDigest: string | null;
  managementControllerId: number | null;
  dockerProvisionToken: string | null;
  dockerProvisionState: string | null;
  platformReport: string | null;
  codesysState: string | null;
  progressPercent: number | null;
  progressStep: string | null;
  progressDetail: string | null;
  auditLog: string;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}
