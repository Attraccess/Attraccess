import { MemoryDeviceAdapter } from './adapters';
import { JsonStateStore, WagoRuntime, hash, type Snapshot, type Transport } from './runtime';

class TestTransport implements Transport {
  readonly published: Array<{ topic: string; payload: unknown; retain?: boolean }> = [];
  readonly listeners = new Map<string, (payload: Buffer) => void | Promise<void>>();
  async publish(topic: string, payload: unknown, options?: { retain?: boolean }): Promise<void> { this.published.push({ topic, payload, retain: options?.retain }); }
  async subscribe(topic: string, listener: (payload: Buffer) => void | Promise<void>): Promise<void> { this.listeners.set(topic, listener); }
  async send(topic: string, value: unknown): Promise<void> { await this.listeners.get(topic)?.(Buffer.from(JSON.stringify(value))); }
}

const snapshot: Snapshot = {
  version: 1,
  physicalPoints: [{ id: 'output-1', hardwareProfile: '751-9301', channel: 0 }],
  logicalChannels: [{ id: 'load', physicalPointId: 'output-1', profile: 'generic-digital-output', capabilities: ['output', 'pulse'], disconnectPolicy: { mode: 'immediate' }, pulse: { durationMs: 10 } }],
};

describe('WagoRuntime', () => {
  let transport: TestTransport;
  let device: MemoryDeviceAdapter;
  let runtime: WagoRuntime;
  const desired = 'attraccess/wago/v1/controllers/cc100-1/configuration/desired';
  const commands = 'attraccess/wago/v1/controllers/cc100-1/commands';

  beforeEach(async () => {
    transport = new TestTransport();
    device = new MemoryDeviceAdapter();
    runtime = new WagoRuntime({ hardwareId: 'cc100-1', prefix: 'attraccess/wago', store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`), transport, device });
    await runtime.start();
  });

  it('applies a complete valid retained snapshot and reports its revision', async () => {
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    expect(transport.published).toContainEqual(expect.objectContaining({ topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported', payload: { revision: 1, contentHash: hash(snapshot), errors: [] }, retain: true }));
  });

  it('rejects an invalid snapshot without replacing the last valid configuration', async () => {
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(desired, { protocolVersion: 1, revision: 2, contentHash: 'wrong', snapshot: { ...snapshot, physicalPoints: [] } });
    await transport.send(commands, { id: 'command-1', channelId: 'load', action: 'set', value: true });
    expect(device.values.get('751-9301:0')).toBe(true);
    expect(transport.published).toContainEqual(expect.objectContaining({ topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported', payload: expect.objectContaining({ revision: 2, errors: expect.any(Array) }) }));
  });

  it('acknowledges duplicate commands and enforces immediate disconnect policy', async () => {
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, { id: 'command-1', channelId: 'load', action: 'set', value: true });
    await transport.send(commands, { id: 'command-1', channelId: 'load', action: 'set', value: false });
    await runtime.setConnected(false);
    expect(device.values.get('751-9301:0')).toBe(false);
    expect(transport.published).toContainEqual(expect.objectContaining({ topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements', payload: { id: 'command-1', status: 'duplicate', error: undefined } }));
  });
});
