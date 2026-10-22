export type WagoTrustState = 'untrusted' | 'claimed';

export interface WagoController {
  id: number;
  hardwareId: string;
  trustState: WagoTrustState;
  name: string | null;
  mqttServerId: number | null;
  /** Durable permanent-identity provisioning intent, retained until confirmed revocation. */
  credentialMqttServerId?: number | null;
  /** Changes whenever permanent broker credentials are issued, binding later rotations to that claim. */
  credentialEpoch?: string | null;
  enrollmentId: number | null;
  pairingCodeHash: string;
  fingerprint: string | null;
  protocolVersion: string;
  runtimeVersion: string;
  capabilities: string;
  lastSequence: number;
  lastHeartbeatAt: string | null;
  lastSeenAt: string;
  compatibilityError: string | null;
  createdAt: string;
  updatedAt: string;
}
