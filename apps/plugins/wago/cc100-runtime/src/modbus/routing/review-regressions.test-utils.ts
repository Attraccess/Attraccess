import type { ModbusConfiguration } from '../../../../modbus/model';

import { hash, JsonStateStore, type RuntimeState, type Snapshot, WagoRuntime } from '../../runtime';

import { ModbusDeviceRouter } from './adapter';

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export let nextBus = 0;

export function snapshot(): Snapshot & { modbus: ModbusConfiguration } {
  const format = {
    address: 12,
    addressBase: 0 as const,
    dataType: 'uint16' as const,
    byteOrder: 'big' as const,
    wordOrder: 'big' as const,
    scale: 1,
    offset: 0,
  };
  return {
    version: 1,
    modbus: {
      connections: [
        {
          id: 'bus',
          transport: 'rtu',
          path: `/dev/fixture-review-${++nextBus}`,
          baudRate: 19200,
          parity: 'even',
          stopBits: 1,
          timeoutMs: 25,
          reconnectMs: 0,
          queueLimit: 4,
        },
      ],
      devices: [
        { id: 'device', name: 'Device', connectionId: 'bus', unitId: 1, profileId: 'profile', profileVersion: 1 },
      ],
      profiles: [
        {
          id: 'profile',
          name: 'Profile',
          version: 1,
          measurements: [
            {
              ...format,
              id: 'energy',
              name: 'Energy',
              functionCode: 3,
              unit: 'watt-hour',
              kind: 'cumulative',
              rollover: 100,
              pollIntervalMs: 100,
            },
          ],
          actions: [{ ...format, id: 'switch', name: 'Switch', functionCode: 6, onValue: 1, offValue: 0 }],
        },
      ],
    },
    physicalPoints: [
      {
        id: 'point',
        hardwareProfile: 'modbus',
        channel: 0,
        modbus: { deviceId: 'device', measurementId: 'energy', actionId: 'switch' },
      },
    ],
    logicalChannels: [
      {
        id: 'energy-1',
        physicalPointId: 'point',
        profile: 'generic-monitored-input',
        capabilities: ['input', 'measurement'],
        disconnectPolicy: { mode: 'hold' },
        measurement: { unit: 'watt-hour', scale: 1, offset: 0, kind: 'cumulative' },
      },
      {
        id: 'output',
        physicalPointId: 'point',
        profile: 'generic-digital-output',
        capabilities: ['output'],
        disconnectPolicy: { mode: 'immediate' },
      },
    ],
  } satisfies Snapshot;
}

export class MemoryStore extends JsonStateStore {
  saved: RuntimeState;
  constructor(initial: Snapshot) {
    super('/unused-in-memory');
    this.saved = {
      outputs: {},
      commandIds: [],
      accepted: { revision: 1, contentHash: hash(initial), snapshot: initial },
    };
  }
  override async load() {
    return structuredClone(this.saved);
  }
  override async save(state: RuntimeState) {
    this.saved = structuredClone(state);
  }
}

export function harness(initial: Snapshot, device: ModbusDeviceRouter, store = new MemoryStore(initial)) {
  const published: Array<{ topic: string; payload: Record<string, unknown> }> = [];
  const runtime = new WagoRuntime({
    hardwareId: 'fixture',
    prefix: 'test',
    pairingCode: 'fixture',
    store,
    device,
    transport: {
      subscribe: async () => undefined,
      publish: async (topic, payload) => {
        published.push({ topic, payload: payload as Record<string, unknown> });
      },
    },
  });
  return { runtime, store, published };
}

export const onboard = { read: async () => false, write: async () => undefined };

export const desired = (s: Snapshot, revision = 2) =>
  Buffer.from(JSON.stringify({ protocolVersion: 1, revision, contentHash: hash(s), snapshot: s }));

export const command = (id: string, value = true, revision = 1) =>
  Buffer.from(
    JSON.stringify({
      id,
      channelId: 'output',
      action: 'set',
      value,
      expectedConfigurationRevision: revision,
      expiresAt: '2099-01-01T00:00:00.000Z',
    }),
  );
