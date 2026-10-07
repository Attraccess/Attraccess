import type { Measurement } from '../measurement-contract';
export type WagoOperationalMessageBase = {
  timestamp: string;
  streamId: string;
  sequence: number;
};

export type WagoAcknowledgementMessage = WagoOperationalMessageBase & {
  category: 'acknowledgement';
  id: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  error?: string;
};
export interface WagoAnnouncement {
  hardwareId: string;
  pairingCode: string;
  enrollmentSecret?: string;
  fingerprint?: string;
  protocolVersion: string;
  runtimeVersion: string;
  runtimeImageId?: string;
  runtimePolicyToken?: string;
  capabilities: string[];
  sequence?: number;
}

export type WagoFaultMessage = WagoOperationalMessageBase & {
  category: 'fault';
  channelId: string;
  code: string;
  message: string;
};

export type WagoHeartbeat = Omit<WagoAnnouncement, 'pairingCode'>;

export type WagoMeasurementMessage = WagoOperationalMessageBase &
  Measurement & {
    category: 'measurement';
  };

export type WagoStateMessage = WagoOperationalMessageBase & {
  category: 'state';
  connected: boolean;
  revision: number | null;
  contentHash: string | null;
  outputs: Record<string, boolean>;
  inputs?: Record<string, boolean>;
  readiness?: { hardwareAvailable: boolean };
};

export type WagoOperationalMessage =
  WagoStateMessage | WagoMeasurementMessage | WagoFaultMessage | WagoAcknowledgementMessage;
