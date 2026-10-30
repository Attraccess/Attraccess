import { MemoryDeviceAdapter } from './io/adapters';
import { JsonStateStore, WagoRuntime, type Snapshot, type Transport } from './runtime';
import type { MessageSlot, SubscribeOptions } from './runtime/types';

export class TestTransport implements Transport {
  readonly published: Array<{ topic: string; payload: unknown; retain?: boolean }> = [];
  readonly listeners = new Map<string, (payload: Buffer, slot: MessageSlot) => void | Promise<void>>();
  /** Options each topic was subscribed with, so tests can check the admission limits are wired. */
  readonly subscriptions = new Map<string, SubscribeOptions | undefined>();
  dropCounts?: () => Record<string, number>;
  /** Like MqttTransport, a publish while disconnected is refused instead of being silently dropped. */
  connected = true;
  async publish(topic: string, payload: unknown, options?: { retain?: boolean }): Promise<void> {
    if (!this.connected) throw new Error('MQTT connection unavailable');
    this.published.push({ topic, payload, retain: options?.retain });
  }
  async subscribe(
    topic: string,
    listener: (payload: Buffer, slot: MessageSlot) => void | Promise<void>,
    options?: SubscribeOptions,
  ): Promise<void> {
    this.listeners.set(topic, listener);
    this.subscriptions.set(topic, options);
  }
  async send(topic: string, value: unknown): Promise<void> {
    await this.listeners.get(topic)?.(Buffer.from(JSON.stringify(value)), { release: () => undefined });
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
