import { BadRequestException } from '@nestjs/common';

export type NetworkInput = { targetHost: string; mqttServerId: number | null };

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

export class NetworkChangeError extends Error {
  constructor(
    readonly failure: 'broker_configuration' | 'broker_provisioning' | 'broker_verification' | 'host_connection',
  ) {
    super(failure);
  }
}

export const EVIDENCE_MS = 120_000;

export const OPERATION_MS = 20 * 60_000;

export function networkChangeInput(body: unknown): NetworkInput {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new BadRequestException('Invalid MQTT/address change');
  const input = body as NetworkInput;
  if (
    Object.keys(input).some((k) => !['targetHost', 'mqttServerId'].includes(k)) ||
    typeof input.targetHost !== 'string' ||
    !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(input.targetHost)
  )
    throw new BadRequestException('Enter the CC100 private IPv4 address.');
  const octets = input.targetHost.split('.').map(Number);
  if (
    octets.some((n) => n > 255) ||
    octets.join('.') !== input.targetHost ||
    !(
      octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    )
  )
    throw new BadRequestException('Enter the CC100 private IPv4 address.');
  if (input.mqttServerId !== null && (!Number.isSafeInteger(input.mqttServerId) || input.mqttServerId <= 0))
    throw new BadRequestException('Select a configured MQTT server or update only the address.');
  return { targetHost: input.targetHost, mqttServerId: input.mqttServerId };
}
