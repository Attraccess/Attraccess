import { MemoryDeviceAdapter } from './adapters';
import { JsonStateStore, WagoRuntime, hash, validateSnapshot, type Snapshot, type Transport } from './runtime';

class TestTransport implements Transport {
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

const snapshot: Snapshot = {
  version: 1,
  physicalPoints: [{ id: 'output-1', hardwareProfile: '751-9301', channel: 0 }],
  logicalChannels: [
    {
      id: 'load',
      physicalPointId: 'output-1',
      profile: 'generic-digital-output',
      capabilities: ['output', 'pulse'],
      disconnectPolicy: { mode: 'immediate' },
      pulse: { durationMs: 10 },
    },
  ],
};

describe('WagoRuntime', () => {
  let transport: TestTransport;
  let device: MemoryDeviceAdapter;
  let runtime: WagoRuntime;
  const desired = 'attraccess/wago/v1/controllers/cc100-1/configuration/desired';
  const commands = 'attraccess/wago/v1/controllers/cc100-1/commands';
  const validCommand = (overrides: Record<string, unknown> = {}) => ({
    id: 'command-1',
    expiresAt: '2099-01-01T00:00:00.000Z',
    expectedConfigurationRevision: 1,
    channelId: 'load',
    action: 'set',
    value: true,
    ...overrides,
  });

  beforeEach(async () => {
    transport = new TestTransport();
    device = new MemoryDeviceAdapter();
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      enrollmentSecret: 'enrollment-secret',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device,
    });
    await runtime.start();
  });

  it('applies a complete valid retained snapshot and reports its revision', async () => {
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: { revision: 1, contentHash: hash(snapshot), errors: [] },
        retain: true,
      }),
    );
  });

  it('publishes the required retained discovery announcement and persists a valid claim', async () => {
    await runtime.publishDiscoveryAnnouncement(1);
    expect(transport.published).toContainEqual({
      topic: 'attraccess/wago/discovery/cc100-1',
      payload: expect.objectContaining({
        hardwareId: 'cc100-1',
        pairingCode: '482931',
        enrollmentSecret: 'enrollment-secret',
        protocolVersion: '1.0.0',
        runtimeVersion: '0.1.0',
        capabilities: expect.arrayContaining(['claim', 'heartbeat', 'configuration-v1']),
        sequence: 1,
      }),
      retain: true,
    });
    await expect(
      runtime.receiveDiscoveryClaim(
        Buffer.from(
          '{"username":"controller","password":"secret","configuration":{"namespace":"customer/wago"},"acknowledgementToken":"claim-token"}',
        ),
      ),
    ).resolves.toEqual({ username: 'controller', password: 'secret', prefix: 'customer/wago' });
    expect(transport.published).toContainEqual({
      topic: 'attraccess/wago/discovery/cc100-1/claim/ack',
      payload: { acknowledgementToken: 'claim-token' },
      retain: undefined,
    });
    await expect(runtime.receiveDiscoveryClaim(Buffer.from('{"username":"controller"}'))).resolves.toBeUndefined();
  });

  it('preserves persisted runtime state when receiving a discovery claim before startup', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    await store.save({
      accepted: { revision: 3, contentHash: hash(snapshot), snapshot },
      outputs: { load: true },
      commandIds: ['command-1'],
    });
    const discoveryRuntime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      enrollmentSecret: 'enrollment-secret',
      store,
      transport,
      device,
    });

    await discoveryRuntime.receiveDiscoveryClaim(Buffer.from('{"username":"controller","password":"secret"}'));

    await expect(store.load()).resolves.toEqual({
      accepted: { revision: 3, contentHash: hash(snapshot), snapshot },
      outputs: { load: true },
      commandIds: ['command-1'],
      commandExpiries: {},
      credentials: { username: 'controller', password: 'secret' },
    });
  });

  it('includes the pairing code in the backend-compatible heartbeat', async () => {
    await runtime.publishHeartbeat();
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/heartbeat',
        payload: expect.objectContaining({
          hardwareId: 'cc100-1',
          pairingCode: '482931',
          protocolVersion: '1.0.0',
          runtimeVersion: '0.1.0',
        }),
      }),
    );
  });

  it('accepts opaque server-defined profile names', async () => {
    const serverDefined = {
      ...snapshot,
      logicalChannels: [{ ...snapshot.logicalChannels[0], profile: 'server-defined-profile' }],
    };
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(serverDefined),
      snapshot: serverDefined,
    });

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: { revision: 1, contentHash: hash(serverDefined), errors: [] },
        retain: true,
      }),
    );
  });
  it('rejects an invalid snapshot without replacing the last valid configuration', async () => {
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: 'wrong',
      snapshot: { ...snapshot, physicalPoints: [] },
    });
    await transport.send(commands, validCommand());
    expect(device.values.get('751-9301:0')).toBe(true);
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: expect.objectContaining({ revision: 2, errors: expect.any(Array) }),
      }),
    );
  });

  it('reports malformed snapshot capabilities instead of throwing', async () => {
    const malformed = {
      ...snapshot,
      logicalChannels: [{ ...snapshot.logicalChannels[0], capabilities: undefined }],
    };
    await expect(
      transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(malformed), snapshot: malformed }),
    ).resolves.toBeUndefined();
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: expect.objectContaining({
          errors: expect.arrayContaining([expect.objectContaining({ code: 'invalid_capabilities' })]),
        }),
      }),
    );
  });

  it('rejects malformed channel definitions before they can reach device control', () => {
    const errors = validateSnapshot({
      ...snapshot,
      unexpected: true,
      logicalChannels: [
        {
          ...snapshot.logicalChannels[0],
          profile: '',
          capabilities: ['output', 'output', 'unsupported'],
          feedback: { channelId: 'load', expected: 'unknown', timeoutMs: 0 },
          range: { minimum: 1, maximum: 0 },
          measurement: { unit: 'unknown', scale: Number.NaN, offset: Number.NaN },
        },
      ],
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unknown_field' }),
        expect.objectContaining({ code: 'invalid_profile' }),
        expect.objectContaining({ code: 'invalid_capabilities' }),
        expect.objectContaining({ code: 'invalid_feedback' }),
        expect.objectContaining({ code: 'invalid_range' }),
        expect.objectContaining({ code: 'invalid_measurement' }),
      ]),
    );
  });

  it('rejects duplicate logical channel IDs', async () => {
    const duplicated = {
      ...snapshot,
      logicalChannels: [...snapshot.logicalChannels, { ...snapshot.logicalChannels[0] }],
    };
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(duplicated),
      snapshot: duplicated,
    });
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: expect.objectContaining({
          errors: expect.arrayContaining([expect.objectContaining({ path: 'snapshot.logicalChannels[0].id' })]),
        }),
      }),
    );
  });

  it('evaluates guards against their physical input', async () => {
    const guarded: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'interlock',
          physicalPointId: 'input-1',
          profile: 'generic-digital-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          ...snapshot.logicalChannels[0],
          capabilities: ['output', 'guard', 'pulse'],
          guard: { channelId: 'interlock', when: 'on' },
        },
      ],
    };
    device.values.set('751-9301:1', true);
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(guarded), snapshot: guarded });
    await transport.send(commands, validCommand());
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
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: delayedDevice,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await Promise.all([transport.send(commands, validCommand()), transport.send(commands, validCommand())]);
    expect(writes).toEqual([true]);
  });

  it('rejects expired commands before writing the device', async () => {
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });

    await transport.send(commands, {
      id: 'expired-command',
      expiresAt: '2000-01-01T00:00:00.000Z',
      channelId: 'load',
      action: 'set',
      value: true,
      expectedConfigurationRevision: 1,
    });

    expect(device.values.get('751-9301:0')).toBeUndefined();
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'expired-command', status: 'rejected', code: 'expired' }),
      }),
    );
  });

  it('rejects commands without expiry or a configuration revision before writing the device', async () => {
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });

    await transport.send(commands, validCommand({ id: 'missing-expiry', expiresAt: undefined }));
    await transport.send(commands, validCommand({ id: 'missing-revision', expectedConfigurationRevision: undefined }));

    expect(device.values.get('751-9301:0')).toBeUndefined();
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ id: 'missing-expiry', status: 'rejected', code: 'expired' }),
      }),
    );
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ id: 'missing-revision', status: 'rejected', code: 'invalid_command' }),
      }),
    );
  });

  it('rejects stale configuration revisions before writing the device', async () => {
    await transport.send(desired, { protocolVersion: 1, revision: 2, contentHash: hash(snapshot), snapshot });

    await transport.send(commands, {
      id: 'stale-command',
      expiresAt: '2099-01-01T00:00:00.000Z',
      channelId: 'load',
      action: 'set',
      value: true,
      expectedConfigurationRevision: 1,
    });

    expect(device.values.get('751-9301:0')).toBeUndefined();
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'stale-command', status: 'rejected', code: 'stale_revision' }),
      }),
    );
  });

  it('does not repeat an unexpired pulse after a runtime reboot', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport,
      device,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, {
      id: 'durable-pulse',
      expiresAt: '2099-01-01T00:00:00.000Z',
      channelId: 'load',
      action: 'pulse',
      expectedConfigurationRevision: 1,
    });
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport,
      device,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, {
      id: 'durable-pulse',
      expiresAt: '2099-01-01T00:00:00.000Z',
      channelId: 'load',
      action: 'pulse',
      expectedConfigurationRevision: 1,
    });

    expect(
      transport.published.filter(
        (message) =>
          message.payload &&
          typeof message.payload === 'object' &&
          (message.payload as { id?: string }).id === 'durable-pulse',
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ payload: expect.objectContaining({ status: 'duplicate' }) })]),
    );
  });

  it('allows a command ID to be reused after its persisted expiry', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    await store.save({
      accepted: { revision: 1, contentHash: hash(snapshot), snapshot },
      outputs: {},
      commandIds: ['expired-command'],
      commandExpiries: { 'expired-command': '2000-01-01T00:00:00.000Z' },
    });
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport,
      device,
    });
    await runtime.start();

    await transport.send(commands, validCommand({ id: 'expired-command' }));

    expect(device.values.get('751-9301:0')).toBe(true);
    expect(transport.published).toContainEqual(
      expect.objectContaining({ payload: expect.objectContaining({ id: 'expired-command', status: 'accepted' }) }),
    );
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
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: flakyDevice,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, validCommand());
    await transport.send(commands, validCommand());

    expect(attempts).toBe(2);
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'command-1', status: 'accepted', error: undefined }),
      }),
    );
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
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: failingTransport,
      device,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    failStatePublication = true;

    await transport.send(commands, validCommand({ action: 'pulse' }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(device.values.get('751-9301:0')).toBe(false);
  });

  it('retries a failed scheduled pulse shutdown', async () => {
    const writes: boolean[] = [];
    const flakyDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        writes.push(value);
        if (!value && writes.filter((written) => !written).length === 1) throw new Error('temporary shutdown failure');
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: flakyDevice,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, validCommand({ action: 'pulse' }));

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(writes).toEqual([true, false, false]);
  });

  it('de-energizes active pulses before applying a replacement configuration', async () => {
    const replacement: Snapshot = {
      ...snapshot,
      physicalPoints: [{ id: 'output-2', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [{ ...snapshot.logicalChannels[0], physicalPointId: 'output-2' }],
    };
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, validCommand({ action: 'pulse' }));

    await transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(replacement),
      snapshot: replacement,
    });

    expect(device.values.get('751-9301:0')).toBe(false);
  });

  it('keeps retrying a failed pulse shutdown until a replacement can de-energize it', async () => {
    jest.useFakeTimers();
    let failShutdown = false;
    let shutdownAttempts = 0;
    const flakyDevice = {
      write: async (point: Snapshot['physicalPoints'][number], value: boolean) => {
        if (failShutdown && !value) {
          shutdownAttempts += 1;
          throw new Error('relay write failed');
        }
        device.values.set(`${point.hardwareProfile}:${point.channel}`, value);
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: flakyDevice,
    });
    try {
      await runtime.start();
      await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
      await transport.send(commands, validCommand({ action: 'pulse' }));
      failShutdown = true;

      await transport.send(desired, { protocolVersion: 1, revision: 2, contentHash: hash(snapshot), snapshot });

      expect(transport.published).toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
          payload: expect.objectContaining({ revision: 2, errors: expect.arrayContaining([expect.any(Object)]) }),
        }),
      );
      expect(shutdownAttempts).toBe(1);
      await jest.advanceTimersByTimeAsync(3_100);
      expect(shutdownAttempts).toBe(6);
      await jest.advanceTimersByTimeAsync(5_000);
      expect(shutdownAttempts).toBe(7);

      failShutdown = false;
      await transport.send(desired, { protocolVersion: 1, revision: 3, contentHash: hash(snapshot), snapshot });

      expect(device.values.get('751-9301:0')).toBe(false);
      expect(transport.published).toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
          payload: expect.objectContaining({ revision: 3, errors: [] }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('shuts down a pulse that completes while configuration replacement is waiting', async () => {
    let releaseWrite!: () => void;
    let writeStarted!: () => void;
    const write = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const started = new Promise<void>((resolve) => {
      writeStarted = resolve;
    });
    const delayedDevice = {
      write: async (point: Snapshot['physicalPoints'][number], value: boolean) => {
        if (value) {
          writeStarted();
          await write;
        }
        device.values.set(`${point.hardwareProfile}:${point.channel}`, value);
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: delayedDevice,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });

    const pulse = transport.send(commands, validCommand({ action: 'pulse' }));
    await started;
    const replacement = transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(snapshot),
      snapshot,
    });
    releaseWrite();
    await Promise.all([pulse, replacement]);

    expect(device.values.get('751-9301:0')).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(device.values.get('751-9301:0')).toBe(false);
  });

  it('serializes desired configuration replacements in arrival order', async () => {
    let releaseShutdown!: () => void;
    let shutdownStarted!: () => void;
    const shutdown = new Promise<void>((resolve) => {
      releaseShutdown = resolve;
    });
    const started = new Promise<void>((resolve) => {
      shutdownStarted = resolve;
    });
    const delayedDevice = {
      write: async (point: Snapshot['physicalPoints'][number], value: boolean) => {
        if (!value) {
          shutdownStarted();
          await shutdown;
        }
        device.values.set(`${point.hardwareProfile}:${point.channel}`, value);
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: delayedDevice,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, validCommand({ action: 'pulse' }));

    const revisionTwo = transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(snapshot),
      snapshot,
    });
    await started;
    const revisionThree = transport.send(desired, {
      protocolVersion: 1,
      revision: 3,
      contentHash: hash(snapshot),
      snapshot,
    });
    releaseShutdown();
    await Promise.all([revisionTwo, revisionThree]);

    await transport.send(commands, validCommand({ id: 'revision-three', expectedConfigurationRevision: 3 }));
    expect(device.values.get('751-9301:0')).toBe(true);
  });

  it('keeps a newer set command from being overridden by a pending pulse timer', async () => {
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });

    await transport.send(commands, validCommand({ id: 'pulse', action: 'pulse' }));
    await transport.send(commands, validCommand({ id: 'set', value: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(device.values.get('751-9301:0')).toBe(true);
  });

  it('serializes commands for one channel in arrival order', async () => {
    const writes: boolean[] = [];
    let releaseFirst!: () => void;
    let firstWriteStarted!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const started = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    const delayedDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        writes.push(value);
        if (writes.length === 1) {
          firstWriteStarted();
          await firstWrite;
        }
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: delayedDevice,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });

    const first = transport.send(commands, validCommand({ id: 'first', value: true }));
    const second = transport.send(commands, validCommand({ id: 'second', value: false }));
    await started;
    expect(writes).toEqual([true]);
    releaseFirst();
    await Promise.all([first, second]);

    expect(writes).toEqual([true, false]);
  });

  it('reports configured feedback mismatches after output writes', async () => {
    const monitored: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'feedback',
          physicalPointId: 'input-1',
          profile: 'generic-digital-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          ...snapshot.logicalChannels[0],
          capabilities: ['output', 'feedback'],
          pulse: undefined,
          feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 5 },
        },
      ],
    };
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    await transport.send(commands, validCommand());
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
        payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
      }),
    );
  });

  it('starts feedback verification before retained-state publication completes', async () => {
    jest.useFakeTimers();
    const monitored: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'feedback',
          physicalPointId: 'input-1',
          profile: 'generic-digital-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          ...snapshot.logicalChannels[0],
          capabilities: ['output', 'feedback'],
          pulse: undefined,
          feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 5 },
        },
      ],
    };
    let delayStatePublication = false;
    let releaseStatePublication!: () => void;
    let statePublicationStarted!: () => void;
    const statePublication = new Promise<void>((resolve) => {
      releaseStatePublication = resolve;
    });
    const startedStatePublication = new Promise<void>((resolve) => {
      statePublicationStarted = resolve;
    });
    const delayedTransport: Transport = {
      publish: async (topic, payload, options) => {
        if (delayStatePublication && topic.endsWith('/state')) {
          statePublicationStarted();
          await statePublication;
        }
        await transport.publish(topic, payload, options);
      },
      subscribe: async (topic, listener) => transport.subscribe(topic, listener),
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: delayedTransport,
      device,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    delayStatePublication = true;

    try {
      const command = transport.send(commands, validCommand());
      await startedStatePublication;
      await jest.advanceTimersByTimeAsync(10);

      expect(transport.published).toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
          payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
        }),
      );
      releaseStatePublication();
      await command;
    } finally {
      releaseStatePublication();
      jest.useRealTimers();
    }
  });

  it('rejects a command that waits behind a write when its configuration changes', async () => {
    const writes: boolean[] = [];
    let releaseFirst!: () => void;
    let firstWriteStarted!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const started = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    const delayedDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        writes.push(value);
        if (writes.length === 1) {
          firstWriteStarted();
          await firstWrite;
        }
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: delayedDevice,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });

    const first = transport.send(commands, validCommand({ id: 'first' }));
    const second = transport.send(commands, validCommand({ id: 'second' }));
    await started;
    const replacement = transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(snapshot),
      snapshot,
    });
    releaseFirst();
    await Promise.all([first, second, replacement]);

    expect(writes).toEqual([true]);
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'second', status: 'rejected', code: 'stale_revision' }),
      }),
    );
  });

  it('does not acknowledge a pulse when persisting its output state fails', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport,
      device,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    const persist = store.save.bind(store);
    const save = jest.spyOn(store, 'save');
    save.mockImplementationOnce(persist).mockRejectedValueOnce(new Error('disk full'));

    await expect(transport.send(commands, validCommand({ action: 'pulse' }))).rejects.toThrow(
      'failed to persist channel state',
    );

    expect(device.values.get('751-9301:0')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(device.values.get('751-9301:0')).toBe(false);
    expect(transport.published).not.toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'command-1', status: 'accepted' }),
      }),
    );
  });

  it('keeps the previous configuration active when persisting a replacement fails', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport,
      device,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    const persist = store.save.bind(store);
    jest.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full')).mockImplementation(persist);

    await transport.send(desired, { protocolVersion: 1, revision: 2, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, validCommand({ id: 'revision-one', expectedConfigurationRevision: 1 }));
    await transport.send(commands, validCommand({ id: 'revision-two', expectedConfigurationRevision: 2 }));

    expect(device.values.get('751-9301:0')).toBe(true);
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'revision-two', status: 'rejected', code: 'stale_revision' }),
      }),
    );
  });

  it('persists a command reservation before actuating the device', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    const reservingDevice = {
      write: async () => {
        expect((await store.load()).commandIds).toContain('command-1');
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport,
      device: reservingDevice,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });

    await transport.send(commands, validCommand());

    await expect(store.load()).resolves.toEqual(expect.objectContaining({ commandIds: ['command-1'] }));
  });

  it('acknowledges duplicate commands and enforces immediate disconnect policy', async () => {
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, validCommand());
    await transport.send(commands, validCommand({ value: false }));
    await runtime.setConnected(false);
    expect(device.values.get('751-9301:0')).toBe(false);
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'command-1', status: 'duplicate', error: undefined }),
      }),
    );
  });

  it('retries the aggregate immediate shutdown state after a state-store failure', async () => {
    const twoOutputs: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'output-2', hardwareProfile: '751-9301', channel: 1 }],
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
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport,
      device,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(twoOutputs),
      snapshot: twoOutputs,
    });
    await transport.send(commands, validCommand());
    await transport.send(commands, validCommand({ id: 'command-2', channelId: 'load-2' }));
    const persist = store.save.bind(store);
    jest.spyOn(store, 'save').mockImplementationOnce(persist).mockRejectedValueOnce(new Error('disk full'));

    await expect(runtime.setConnected(false)).resolves.toBeUndefined();

    expect(device.values.get('751-9301:0')).toBe(false);
    expect(device.values.get('751-9301:1')).toBe(false);
    await expect(store.load()).resolves.toEqual(expect.objectContaining({ outputs: { load: false, 'load-2': false } }));
  });

  it('persists output and connection state changes', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport,
      device,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, validCommand());
    await runtime.setConnected(false);
    expect((await store.load()).outputs).toEqual({ load: false });
    expect(transport.published.filter((message) => message.topic.endsWith('/state')).at(-1)).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ connected: false, outputs: { load: false } }),
        retain: true,
      }),
    );
  });

  it('serializes concurrent state saves', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    await Promise.all([
      store.save({ outputs: { load: false }, commandIds: [] }),
      store.save({ outputs: { load: true }, commandIds: ['command-1'] }),
    ]);

    await expect(store.load()).resolves.toEqual({
      outputs: { load: true },
      commandIds: ['command-1'],
      commandExpiries: {},
    });
  });
});
