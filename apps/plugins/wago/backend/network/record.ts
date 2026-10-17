export type WagoNetworkChangePhase = 'connecting' | 'provisioning' | 'applying' | 'verifying' | 'saving' | 'completed';

/** Durable roll-forward intent. Only an explicit public projection may leave the backend. */
export interface WagoNetworkChange {
  controllerId: number;
  sessionId: number;
  fingerprint: string;
  targetHost: string;
  mqttServerId: number | null;
  phase: WagoNetworkChangePhase;
  failure: string | null;
  encryptedPayload: string | null;
  updatedAt: string;
}

/** Retain the old identity's broker association when it cannot be contacted.
 * Migration success never relies on revocation through an unreachable broker.
 */
export interface WagoMqttCredentialRetirement {
  controllerId: number;
  mqttServerId: number;
}
