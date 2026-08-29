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

  it('reports malformed snapshot capabilities instead of throwing', async () => {
    const malformed = {
      ...snapshot,
      logicalChannels: [{ ...snapshot.logicalChannels[0], capabilities: undefined }],
    };
    await expect(transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(malformed), snapshot: malformed })).resolves.toBeUndefined();
    expect(transport.published).toContainEqual(expect.objectContaining({
      topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
      payload: expect.objectContaining({ errors: expect.arrayContaining([expect.objectContaining({ code: 'invalid_capabilities' })]) }),
    }));
  });

  it('rejects duplicate logical channel IDs', async () => {
    const duplicated = { ...snapshot, logicalChannels: [...snapshot.logicalChannels, { ...snapshot.logicalChannels[0] }] };
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(duplicated), snapshot: duplicated });
    expect(transport.published).toContainEqual(expect.objectContaining({
      topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
      payload: expect.objectContaining({ errors: expect.arrayContaining([expect.objectContaining({ path: 'snapshot.logicalChannels[0].id' })]) }),
    }));
  });

  it('evaluates guards against their physical input', async () => {
    const guarded: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        { id: 'interlock', physicalPointId: 'input-1', profile: 'generic-monitored-input', capabilities: ['input'], disconnectPolicy: { mode: 'hold' } },
        { ...snapshot.logicalChannels[0], capabilities: ['output', 'guard', 'pulse'], guard: { channelId: 'interlock', when: 'on' } },
      ],
    };
    device.values.set('751-9301:1', true);
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(guarded), snapshot: guarded });
    await transport.send(commands, { id: 'command-1', channelId: 'load', action: 'set', value: true });
    expect(device.values.get('751-9301:0')).toBe(true);
  });

  it('reserves concurrent command IDs before device writes', async () => {
    const writes: boolean[] = [];
    const delayedDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        writes.push(value);
        await new Promise((resolve) => setTimeout(resolve, 10));
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({ hardwareId: 'cc100-1', prefix: 'attraccess/wago', store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`), transport, device: delayedDevice });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await Promise.all([
      transport.send(commands, { id: 'command-1', channelId: 'load', action: 'set', value: true }),
      transport.send(commands, { id: 'command-1', channelId: 'load', action: 'set', value: true }),
    ]);
    expect(writes).toEqual([true]);
  });

  it('allows a command to be retried after a failed device write', async () => {
    let attempts = 0;
    const flakyDevice = {
      write: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary failure');
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({ hardwareId: 'cc100-1', prefix: 'attraccess/wago', store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`), transport, device: flakyDevice });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, { id: 'command-1', channelId: 'load', action: 'set', value: true });
    await transport.send(commands, { id: 'command-1', channelId: 'load', action: 'set', value: true });

    expect(attempts).toBe(2);
    expect(transport.published).toContainEqual(expect.objectContaining({
      topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
      payload: { id: 'command-1', status: 'accepted', error: undefined },
    }));
  });

  it('deactivates a pulse when retained state publication fails after it turns on', async () => {
    let failStatePublication = false;
    const failingTransport: Transport = {
      publish: async (topic, payload, options) => {
        if (failStatePublication && topic.endsWith('/state')) throw new Error('broker unavailable');
        await transport.publish(topic, payload, options);
      },
      subscribe: async (topic, listener) => transport.subscribe(topic, listener),
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: failingTransport,
      device,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    failStatePublication = true;

    await transport.send(commands, { id: 'command-1', channelId: 'load', action: 'pulse' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(device.values.get('751-9301:0')).toBe(false);
  });

  it('does not acknowledge a pulse when persisting its output state fails', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({ hardwareId: 'cc100-1', prefix: 'attraccess/wago', store, transport, device });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    const persist = store.save.bind(store);
    const save = jest.spyOn(store, 'save');
    save.mockImplementationOnce(persist).mockRejectedValueOnce(new Error('disk full'));

    await expect(transport.send(commands, { id: 'command-1', channelId: 'load', action: 'pulse' })).rejects.toThrow(
      'failed to persist channel state',
    );

    expect(device.values.get('751-9301:0')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(device.values.get('751-9301:0')).toBe(false);
    expect(transport.published).not.toContainEqual(expect.objectContaining({
      topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
      payload: expect.objectContaining({ id: 'command-1', status: 'accepted' }),
    }));
  });

  it('persists a command reservation before actuating the device', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    const reservingDevice = {
      write: async () => {
        expect((await store.load()).commandIds).toContain('command-1');
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({ hardwareId: 'cc100-1', prefix: 'attraccess/wago', store, transport, device: reservingDevice });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });

    await transport.send(commands, { id: 'command-1', channelId: 'load', action: 'set', value: true });

    await expect(store.load()).resolves.toEqual(expect.objectContaining({ commandIds: ['command-1'] }));
  });

  it('acknowledges duplicate commands and enforces immediate disconnect policy', async () => {
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, { id: 'command-1', channelId: 'load', action: 'set', value: true });
    await transport.send(commands, { id: 'command-1', channelId: 'load', action: 'set', value: false });
    await runtime.setConnected(false);
    expect(device.values.get('751-9301:0')).toBe(false);
    await runtime.setConnected(true);
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    expect(transport.published).toContainEqual(expect.objectContaining({ topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements', payload: { id: 'command-1', status: 'duplicate', error: undefined } }));
    expect(transport.published).toContainEqual(expect.objectContaining({ topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported', payload: { revision: 1, contentHash: hash(snapshot), errors: [] }, retain: true }));
  });

  it('reports a feedback mismatch after the configured feedback timeout', async () => {
    const monitored: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        { id: 'feedback', physicalPointId: 'input-1', profile: 'generic-monitored-input', capabilities: ['input'], disconnectPolicy: { mode: 'hold' } },
        { id: 'load', physicalPointId: 'output-1', profile: 'generic-digital-output', capabilities: ['output', 'feedback'], disconnectPolicy: { mode: 'immediate' }, feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 5 } },
      ],
    };
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(monitored), snapshot: monitored });
    await transport.send(commands, { id: 'command-1', channelId: 'load', action: 'set', value: true });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(transport.published).toContainEqual(expect.objectContaining({
      topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
      payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
    }));
  });

  it('retries the aggregate immediate shutdown state after a state-store failure', async () => {
    const twoOutputs: Snapshot = {
      ...snapshot,
      physicalPoints: [
        ...snapshot.physicalPoints,
        { id: 'output-2', hardwareProfile: '751-9301', channel: 1 },
      ],
      logicalChannels: [
        ...snapshot.logicalChannels,
        {
          ...snapshot.logicalChannels[0],
          id: 'load-2',
          physicalPointId: 'output-2',
        },
      ],
    };
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({ hardwareId: 'cc100-1', prefix: 'attraccess/wago', store, transport, device });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(twoOutputs), snapshot: twoOutputs });
    await transport.send(commands, { id: 'command-1', channelId: 'load', action: 'set', value: true });
    await transport.send(commands, { id: 'command-2', channelId: 'load-2', action: 'set', value: true });
    const persist = store.save.bind(store);
    jest.spyOn(store, 'save').mockImplementationOnce(persist).mockRejectedValueOnce(new Error('disk full'));

    await expect(runtime.setConnected(false)).resolves.toBeUndefined();

    expect(device.values.get('751-9301:0')).toBe(false);
    expect(device.values.get('751-9301:1')).toBe(false);
    await expect(store.load()).resolves.toEqual(expect.objectContaining({ outputs: { load: false, 'load-2': false } }));
  });

  it('persists output and connection state changes', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({ hardwareId: 'cc100-1', prefix: 'attraccess/wago', store, transport, device });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, { id: 'command-1', channelId: 'load', action: 'set', value: true });
    await runtime.setConnected(false);
    expect((await store.load()).outputs).toEqual({ load: false });
    expect(transport.published.filter((message) => message.topic.endsWith('/state')).at(-1)).toEqual(expect.objectContaining({
      payload: expect.objectContaining({ connected: false, outputs: { load: false } }),
      retain: true,
    }));
  });

  it('serializes concurrent state saves', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    await Promise.all([
      store.save({ outputs: { load: false }, commandIds: [] }),
      store.save({ outputs: { load: true }, commandIds: ['command-1'] }),
    ]);

    await expect(store.load()).resolves.toEqual({ outputs: { load: true }, commandIds: ['command-1'] });
  });
});
