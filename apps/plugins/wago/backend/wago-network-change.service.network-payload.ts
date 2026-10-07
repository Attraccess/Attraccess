import type { NetworkInput } from "./wago-network-change.service.network-input";

export type NetworkPayload = Omit<NetworkInput, 'mqttServerId'> & {
  mqttServerId: number;
  schema: 1;
  controllerId: number;
  sessionId: number;
  fingerprint: string;
  previousServerId: number;
  previousEpoch: string;
  hardwareId: string;
  operationToken: string;
  credentialEpoch: string;
  token: string;
  prefix: string;
  username: string;
  password: string;
  url: string;
  tlsInsecure: boolean;
  tlsServername: string;
  caCert: string;
  /** Durable predecessor receipt, released only after its replacement is saved. */
  supersededDigest?: string;
};
