import { MemoryDeviceAdapter } from './adapters';
import { JsonStateStore, WagoRuntime, type Snapshot, type Transport } from './runtime';

export class TestTransport implements Transport {
  readonly published: Array<{ topic: string; payload: unknown; retain?: boolean }> = [];
  readonly listeners = new Map<string, (payload: Buffer) => void | Promise<void>>();
  async publish(topic: string, payload: unknown, options?: { retain?: boolean }): Promise<void> {
    this.published.push({ topic, payload, retain: options?.retain });
  }
  async subscribe(topic: string, listener: (payload: Buffer) => void | Promise<void>): Promise<void> {
    this.listeners.set(topic, listener);
  }
  async send(topic: string, value: unknown): Promise<void> {
    await this.listeners.get(topic)?.(Buffer.from(JSON.stringify(value)));
  }
}

export const snapshot: Snapshot = {
  version: 1,
  physicalPoints: [{ id: 'output-1', hardwareProfile: '751-9301', channel: 0 }],
  logicalChannels: [
    {
      id: 'load',
      physicalPointId: 'output-1',
      profile: 'generic-digital-output',
      capabilities: ['output'],
      disconnectPolicy: { mode: 'immediate' },
    },
  ],
};

export const pulsedSnapshot: Snapshot = {
  ...snapshot,
  logicalChannels: [{ ...snapshot.logicalChannels[0], capabilities: ['output', 'pulse'], pulse: { durationMs: 10 } }],
};

export const desired = 'attraccess/wago/v1/controllers/cc100-1/configuration/desired';

export const commands = 'attraccess/wago/v1/controllers/cc100-1/commands';

export const validCommand = (overrides: Record<string, unknown> = {}) => ({
  id: 'command-1',
  expiresAt: '2099-01-01T00:00:00.000Z',
  expectedConfigurationRevision: 1,
  channelId: 'load',
  action: 'set',
  value: true,
  ...overrides,
});

export async function createRuntimeFixture() {
  const transport = new TestTransport();
  const device = new MemoryDeviceAdapter();
  const runtime = new WagoRuntime({
    hardwareId: 'cc100-1',
    prefix: 'attraccess/wago',
    pairingCode: '482931',
    enrollmentSecret: 'enrollment-secret',
    store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
    transport,
    device,
  });
  await runtime.start();

  return { transport, device, runtime };
}
