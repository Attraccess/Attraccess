export type WagoCommissioningState =
  | 'awaiting_delivery'
  | 'delivering'
  | 'awaiting_identity_confirmation'
  | 'awaiting_codesys_confirmation'
  | 'delivery_failed'
  | 'awaiting_discovery'
  | 'awaiting_claim'
  | 'completed'
  | 'awaiting_verification'
  | 'claim_interrupted'
  | 'recovery_revocation_pending'
  | 'revoked';
export interface WagoConfigurationDraft {
  controllerId: number;
  snapshot: string;
  reviewedHash: string | null;
  presetProvenance: string | null;
  updatedAt: string;
}
export interface WagoController {
  id: number;
  hardwareId: string;
  trustState: 'untrusted' | 'claimed';
  name: string | null;
  mqttServerId: number | null;
  protocolVersion: string;
  runtimeVersion: string;
  capabilities: string;
  lastSequence: number;
  lastHeartbeatAt: string | null;
  lastSeenAt: string;
  compatibilityError: string | null;
  connectivity: 'online' | 'stale' | 'untrusted' | 'runtime_check' | 'runtime_update';
}
export interface WagoPreset {
  id:
    | 'metered-switched-load'
    | 'pulsed-lock-bank'
    | 'guarded-enable-request'
    | 'generic-digital-output'
    | 'generic-monitored-input';
  name: string;
  description: string;
}

export interface WagoPresetApplication {
  presetId: WagoPreset['id'];
  channelId: string;
  physicalPointId: string;
  guardChannelId?: string;
  feedbackChannelId?: string;
}
export interface WagoSettings {
  defaultMqttServerId: number | null;
}
