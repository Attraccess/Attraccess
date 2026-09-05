import { MemoryDeviceAdapter } from './adapters';
import {
  MAX_PENDING_CHANNEL_WRITES,
  JsonStateStore,
  WagoRuntime,
  hash,
  validateSnapshot,
  type Snapshot,
  type Transport,
} from './runtime';

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
        sequence: expect.any(Number),
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

  it('starts when reserving initial state telemetry fails', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    await store.save({
      accepted: { revision: 1, contentHash: hash(snapshot), snapshot },
      outputs: { load: true },
      commandIds: [],
    });
    const save = jest.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full'));
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport,
      device,
    });

    await expect(runtime.start()).resolves.toBeUndefined();
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(runtime.setConnected(false)).resolves.toBeUndefined();

    expect(save).toHaveBeenCalled();
    expect(device.values.get('751-9301:0')).toBe(false);
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

    await transport.send(
      commands,
      validCommand({
        id: 'expired-command',
        expiresAt: '2000-01-01T00:00:00.000Z',
        channelId: 'load',
        action: 'set',
        value: true,
        expectedConfigurationRevision: 1,
      }),
    );

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

    await transport.send(
      commands,
      validCommand({
        id: 'stale-command',
        expiresAt: '2099-01-01T00:00:00.000Z',
        channelId: 'load',
        action: 'set',
        value: true,
        expectedConfigurationRevision: 1,
      }),
    );

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
    await transport.send(
      commands,
      validCommand({
        id: 'durable-pulse',
        expiresAt: '2099-01-01T00:00:00.000Z',
        channelId: 'load',
        action: 'pulse',
        expectedConfigurationRevision: 1,
      }),
    );
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
    await transport.send(
      commands,
      validCommand({
        id: 'durable-pulse',
        expiresAt: '2099-01-01T00:00:00.000Z',
        channelId: 'load',
        action: 'pulse',
        expectedConfigurationRevision: 1,
      }),
    );

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

  it('does not postpone a watchdog shutdown for repeated disconnect notifications', async () => {
    jest.useFakeTimers();
    try {
      const watchdogSnapshot: Snapshot = {
        ...snapshot,
        logicalChannels: [{ ...snapshot.logicalChannels[0], disconnectPolicy: { mode: 'watchdog', timeoutMs: 100 } }],
      };
      await transport.send(desired, {
        protocolVersion: 1,
        revision: 1,
        contentHash: hash(watchdogSnapshot),
        snapshot: watchdogSnapshot,
      });
      await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));

      await runtime.setConnected(false);
      await jest.advanceTimersByTimeAsync(90);
      await runtime.setConnected(false);
      await jest.advanceTimersByTimeAsync(10);

      expect(device.values.get('751-9301:0')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels a pending watchdog shutdown when reconnecting', async () => {
    jest.useFakeTimers();
    try {
      const watchdogSnapshot: Snapshot = {
        ...snapshot,
        logicalChannels: [{ ...snapshot.logicalChannels[0], disconnectPolicy: { mode: 'watchdog', timeoutMs: 100 } }],
      };
      await transport.send(desired, {
        protocolVersion: 1,
        revision: 1,
        contentHash: hash(watchdogSnapshot),
        snapshot: watchdogSnapshot,
      });
      await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));

      await runtime.setConnected(false);
      await runtime.setConnected(true);
      await jest.advanceTimersByTimeAsync(100);

      expect(device.values.get('751-9301:0')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
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

  it('rejects numeric digital readback instead of publishing a false boolean', async () => {
    const numericFeedbackDevice = {
      write: async () => undefined,
      read: async () => 1,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: numericFeedbackDevice,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));

    expect(transport.published.filter((message) => message.topic.endsWith('/state')).at(-1)).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          outputs: {},
          readiness: expect.objectContaining({ hardwareAvailable: false }),
        }),
      }),
    );
  });

  it('excludes feedback for outputs removed from the active configuration', async () => {
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));
    const noOutputs: Snapshot = { ...snapshot, logicalChannels: [] };
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(noOutputs),
      snapshot: noOutputs,
    });

    expect(transport.published.filter((message) => message.topic.endsWith('/state')).at(-1)).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ outputs: {} }),
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
  it('publishes typed integer-base-unit measurements with stream identity', async () => {
    const metered: Snapshot = {
      version: 1,
      physicalPoints: [{ id: 'meter', hardwareProfile: '751-9301', channel: 0 }],
      logicalChannels: [
        {
          id: 'import-energy',
          physicalPointId: 'meter',
          profile: 'meter',
          capabilities: ['measurement'],
          disconnectPolicy: { mode: 'hold' },
          measurement: { unit: 'watt-hour', scale: 1, offset: 0, kind: 'cumulative' },
        },
      ],
    };
    device.values.set('751-9301:0', 1234);
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(metered), snapshot: metered });
    await runtime.publishMeasurements();

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/measurements',
        payload: expect.objectContaining({
          channelId: 'import-energy',
          value: 1234000,
          unit: 'milliwatt-hour',
          kind: 'cumulative',
          sequence: expect.any(Number),
          timestamp: expect.any(String),
          streamId: expect.any(String),
        }),
      }),
    );
  });

  it('rounds scaled float measurements within floating-point precision', async () => {
    const metered: Snapshot = {
      version: 1,
      physicalPoints: [{ id: 'meter', hardwareProfile: '751-9301', channel: 0 }],
      logicalChannels: [
        {
          id: 'power',
          physicalPointId: 'meter',
          profile: 'meter',
          capabilities: ['measurement'],
          disconnectPolicy: { mode: 'hold' },
          measurement: { unit: 'watt', scale: 1000, offset: 0 },
        },
      ],
    };
    device.values.set('751-9301:0', 1.001);
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(metered), snapshot: metered });
    await runtime.publishMeasurements();

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/measurements',
        payload: expect.objectContaining({ channelId: 'power', value: 1001000, unit: 'milliwatt' }),
      }),
    );
  });

  it('rejects large fractional measurements', async () => {
    const metered: Snapshot = {
      version: 1,
      physicalPoints: [{ id: 'meter', hardwareProfile: '751-9301', channel: 0 }],
      logicalChannels: [
        {
          id: 'power',
          physicalPointId: 'meter',
          profile: 'meter',
          capabilities: ['measurement'],
          disconnectPolicy: { mode: 'hold' },
          measurement: { unit: 'watt', scale: 1, offset: 0 },
        },
      ],
    };
    device.values.set('751-9301:0', 1_000_000_000_000_000.25);
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(metered), snapshot: metered });
    await runtime.publishMeasurements();

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
        payload: expect.objectContaining({ channelId: 'power', code: 'invalid_measurement_transform' }),
      }),
    );
    expect(transport.published).not.toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/measurements',
      }),
    );
  });

  it('uses a new measurement stream identity after a runtime restart', async () => {
    const metered: Snapshot = {
      version: 1,
      physicalPoints: [{ id: 'meter', hardwareProfile: '751-9301', channel: 0 }],
      logicalChannels: [
        {
          id: 'power',
          physicalPointId: 'meter',
          profile: 'meter',
          capabilities: ['measurement'],
          disconnectPolicy: { mode: 'hold' },
          measurement: { unit: 'watt', scale: 1, offset: 0 },
        },
      ],
    };
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    const firstTransport = new TestTransport();
    const firstRuntime = new WagoRuntime({
      hardwareId: 'cc100-1',
      pairingCode: '482931',
      prefix: 'attraccess/wago',
      store,
      transport: firstTransport,
      device,
    });
    device.values.set('751-9301:0', 1);
    await firstRuntime.start();
    await firstTransport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(metered),
      snapshot: metered,
    });
    await firstRuntime.publishMeasurements();
    const firstEvent = firstTransport.published.find((event) => event.topic.endsWith('/measurements'));
    if (!firstEvent) throw new Error('first runtime did not publish a measurement');
    const firstMeasurement = firstEvent.payload as { sequence: number; streamId: string };

    const restartedTransport = new TestTransport();
    const restartedRuntime = new WagoRuntime({
      hardwareId: 'cc100-1',
      pairingCode: '482931',
      prefix: 'attraccess/wago',
      store,
      transport: restartedTransport,
      device,
    });
    await restartedRuntime.start();
    await restartedRuntime.publishMeasurements();
    const restartedEvent = restartedTransport.published.find((event) => event.topic.endsWith('/measurements'));
    if (!restartedEvent) throw new Error('restarted runtime did not publish a measurement');
    const restartedMeasurement = restartedEvent.payload as { sequence: number; streamId: string };

    expect(restartedMeasurement).toEqual(
      expect.objectContaining({ sequence: expect.any(Number), streamId: expect.any(String) }),
    );
    expect(restartedMeasurement.streamId).not.toBe(firstMeasurement.streamId);
  });

  it('shuts off an accepted pulse after a newer command fails', async () => {
    const pulseSnapshot: Snapshot = {
      ...snapshot,
      logicalChannels: snapshot.logicalChannels.map((channel) => ({
        ...channel,
        pulse: { durationMs: 100 },
      })),
    };
    let resolvePulseWrite: (() => void) | undefined;
    let notifyPulseWriteStarted: (() => void) | undefined;
    const pulseWriteStarted = new Promise<void>((resolve) => {
      notifyPulseWriteStarted = resolve;
    });
    let falseWrites = 0;
    const writes: boolean[] = [];
    const delayedPulseDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        writes.push(value);
        if (value) {
          notifyPulseWriteStarted?.();
          await new Promise<void>((resolve) => {
            resolvePulseWrite = resolve;
          });
        } else if (++falseWrites === 1) throw new Error('temporary failure');
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: delayedPulseDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(pulseSnapshot),
      snapshot: pulseSnapshot,
    });

    const pulse = transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'pulse' }));
    await pulseWriteStarted;
    const set = transport.send(
      commands,
      validCommand({ id: 'command-2', channelId: 'load', action: 'set', value: false }),
    );
    resolvePulseWrite?.();
    await pulse;
    await set;
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'command-1', status: 'accepted', error: undefined }),
      }),
    );
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'command-2', status: 'rejected', error: 'device write failed' }),
      }),
    );
    expect(writes).toEqual([true, false, false]);
  });

  it('shuts off a delayed pulse after a newer command succeeds', async () => {
    let resolvePulseWrite: (() => void) | undefined;
    let notifyPulseWriteStarted: (() => void) | undefined;
    const pulseWriteStarted = new Promise<void>((resolve) => {
      notifyPulseWriteStarted = resolve;
    });
    const writes: boolean[] = [];
    const delayedPulseDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        writes.push(value);
        if (writes.length === 1) {
          notifyPulseWriteStarted?.();
          await new Promise<void>((resolve) => {
            resolvePulseWrite = resolve;
          });
        }
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: delayedPulseDevice,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });

    const pulse = transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'pulse' }));
    await pulseWriteStarted;
    const set = transport.send(
      commands,
      validCommand({ id: 'command-2', channelId: 'load', action: 'set', value: false }),
    );
    resolvePulseWrite?.();
    await pulse;
    await set;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(writes).toEqual([true, false]);
  });

  it('does not let a stale pulse shutoff override a newer successful set command', async () => {
    let resolvePulseWrite: (() => void) | undefined;
    let notifyPulseWriteStarted: (() => void) | undefined;
    const pulseWriteStarted = new Promise<void>((resolve) => {
      notifyPulseWriteStarted = resolve;
    });
    const writes: boolean[] = [];
    const delayedPulseDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        writes.push(value);
        if (writes.length === 1) {
          notifyPulseWriteStarted?.();
          await new Promise<void>((resolve) => {
            resolvePulseWrite = resolve;
          });
        }
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: delayedPulseDevice,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });

    const pulse = transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'pulse' }));
    await pulseWriteStarted;
    const set = transport.send(
      commands,
      validCommand({ id: 'command-2', channelId: 'load', action: 'set', value: true }),
    );
    resolvePulseWrite?.();
    await Promise.all([pulse, set]);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(writes).toEqual([true, true]);
  });

  it('reports a feedback mismatch after the configured feedback timeout', async () => {
    const monitored: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'feedback',
          physicalPointId: 'input-1',
          profile: 'generic-monitored-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          id: 'load',
          physicalPointId: 'output-1',
          profile: 'generic-digital-output',
          capabilities: ['output', 'feedback'],
          disconnectPolicy: { mode: 'immediate' },
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
    await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
        payload: expect.objectContaining({
          channelId: 'load',
          code: 'feedback_mismatch',
          timestamp: expect.any(String),
          sequence: expect.any(Number),
        }),
      }),
    );
  });

  it('preserves feedback verification for the active phase of a short pulse', async () => {
    const monitored: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'feedback',
          physicalPointId: 'input-1',
          profile: 'generic-monitored-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          id: 'load',
          physicalPointId: 'output-1',
          profile: 'pulsed-lock-bank',
          capabilities: ['output', 'pulse', 'feedback'],
          disconnectPolicy: { mode: 'immediate' },
          pulse: { durationMs: 5 },
          feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 15 },
        },
      ],
    };
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'pulse' }));
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
        payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
      }),
    );
  });

  it('cancels feedback checks superseded by a later output command', async () => {
    const monitored: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'feedback',
          physicalPointId: 'input-1',
          profile: 'generic-monitored-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          id: 'load',
          physicalPointId: 'output-1',
          profile: 'generic-digital-output',
          capabilities: ['output', 'feedback'],
          disconnectPolicy: { mode: 'immediate' },
          feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 15 },
        },
      ],
    };
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));
    await transport.send(commands, validCommand({ id: 'command-2', channelId: 'load', action: 'set', value: false }));
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(transport.published).not.toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
        payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
      }),
    );
  });

  it('keeps the prior feedback check when a replacement write fails', async () => {
    const monitored: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'feedback',
          physicalPointId: 'input-1',
          profile: 'generic-monitored-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          id: 'load',
          physicalPointId: 'output-1',
          profile: 'generic-digital-output',
          capabilities: ['output', 'feedback'],
          disconnectPolicy: { mode: 'immediate' },
          feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 10 },
        },
      ],
    };
    const failingDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        if (!value) throw new Error('temporary failure');
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: failingDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));
    await transport.send(commands, validCommand({ id: 'command-2', channelId: 'load', action: 'set', value: false }));
    await new Promise((resolve) => setTimeout(resolve, 15));

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
        payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
      }),
    );
  });

  it('keeps feedback verification for a successful write queued before a failed replacement', async () => {
    const monitored: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'feedback',
          physicalPointId: 'input-1',
          profile: 'generic-monitored-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          id: 'load',
          physicalPointId: 'output-1',
          profile: 'generic-digital-output',
          capabilities: ['output', 'feedback'],
          disconnectPolicy: { mode: 'immediate' },
          feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 5 },
        },
      ],
    };
    let releaseFirstWrite!: () => void;
    let firstWriteStarted!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const started = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    const queuedFailureDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        if (value) {
          firstWriteStarted();
          await firstWrite;
        } else throw new Error('temporary failure');
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: queuedFailureDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });

    const first = transport.send(
      commands,
      validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }),
    );
    await started;
    const replacement = transport.send(
      commands,
      validCommand({ id: 'command-2', channelId: 'load', action: 'set', value: false }),
    );
    releaseFirstWrite();
    await Promise.all([first, replacement]);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
        payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
      }),
    );
  });

  it('does not publish a mismatch from a superseded in-flight feedback check', async () => {
    const monitored: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'feedback',
          physicalPointId: 'input-1',
          profile: 'generic-monitored-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          id: 'load',
          physicalPointId: 'output-1',
          profile: 'generic-digital-output',
          capabilities: ['output', 'feedback'],
          disconnectPolicy: { mode: 'immediate' },
          feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 5 },
        },
      ],
    };
    let delayNextRead = false;
    let resolveRead: ((value: boolean) => void) | undefined;
    const delayedReadDevice = {
      write: async () => undefined,
      read: async () => {
        if (!delayNextRead) return false;
        delayNextRead = false;
        return new Promise<boolean>((resolve) => {
          resolveRead = resolve;
        });
      },
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: delayedReadDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));
    await runtime.pollInputs();
    delayNextRead = true;
    await new Promise((resolve) => setTimeout(resolve, 10));
    await transport.send(commands, validCommand({ id: 'command-2', channelId: 'load', action: 'set', value: false }));
    resolveRead?.(false);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(transport.published).not.toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
        payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
      }),
    );
  });

  it('does not publish a fault from an in-flight feedback check after replacing configuration', async () => {
    const monitored: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'feedback',
          physicalPointId: 'input-1',
          profile: 'generic-monitored-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          id: 'load',
          physicalPointId: 'output-1',
          profile: 'generic-digital-output',
          capabilities: ['output', 'feedback'],
          disconnectPolicy: { mode: 'immediate' },
          feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 5 },
        },
      ],
    };
    let delayNextRead = false;
    let resolveRead: ((value: boolean) => void) | undefined;
    const delayedReadDevice = {
      write: async () => undefined,
      read: async () => {
        if (!delayNextRead) return false;
        delayNextRead = false;
        return new Promise<boolean>((resolve) => {
          resolveRead = resolve;
        });
      },
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: delayedReadDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));
    await runtime.pollInputs();
    delayNextRead = true;
    await new Promise((resolve) => setTimeout(resolve, 10));
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    resolveRead?.(false);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(transport.published).not.toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
        payload: expect.objectContaining({ channelId: 'load' }),
      }),
    );
  });

  it('does not schedule feedback from a write that began before configuration replacement', async () => {
    const monitored: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'feedback',
          physicalPointId: 'input-1',
          profile: 'generic-monitored-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          id: 'load',
          physicalPointId: 'output-1',
          profile: 'generic-digital-output',
          capabilities: ['output', 'feedback'],
          disconnectPolicy: { mode: 'immediate' },
          feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 5 },
        },
      ],
    };
    let releaseWrite!: () => void;
    let writeStarted!: () => void;
    const delayedWrite = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const started = new Promise<void>((resolve) => {
      writeStarted = resolve;
    });
    const delayedWriteDevice = {
      write: async () => {
        writeStarted();
        await delayedWrite;
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: delayedWriteDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });

    const command = transport.send(
      commands,
      validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }),
    );
    await started;
    const replacement = transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    releaseWrite();
    await command;
    await replacement;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(transport.published).not.toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
        payload: expect.objectContaining({ channelId: 'load' }),
      }),
    );
  });

  it('rejects commands beyond the per-channel write queue limit', async () => {
    let releaseFirstWrite!: () => void;
    let firstWriteStarted!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const started = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    const slowDevice = {
      write: async () => {
        firstWriteStarted();
        await firstWrite;
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: slowDevice,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });

    const commandsInFlight = Array.from({ length: MAX_PENDING_CHANNEL_WRITES + 1 }, (_, index) =>
      transport.send(commands, validCommand({ id: `command-${index}`, channelId: 'load', action: 'set', value: true })),
    );
    await started;
    await commandsInFlight[MAX_PENDING_CHANNEL_WRITES];
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({
          id: `command-${MAX_PENDING_CHANNEL_WRITES}`,
          status: 'rejected',
          error: 'channel write queue is full',
        }),
      }),
    );

    releaseFirstWrite();
    await Promise.all(commandsInFlight);
  });

  it('rejects feedback that references the output rather than an input channel', async () => {
    const invalid: Snapshot = {
      ...snapshot,
      logicalChannels: [
        {
          ...snapshot.logicalChannels[0],
          capabilities: ['output', 'pulse', 'feedback'],
          feedback: { channelId: 'load', expected: 'match', timeoutMs: 5 },
        },
      ],
    };
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(invalid), snapshot: invalid });

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({ path: 'snapshot.logicalChannels[0].feedback', code: 'invalid_feedback' }),
          ]),
        }),
      }),
    );
  });
  it('reserves operational message sequences without saving for every measurement', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({ hardwareId: 'cc100-1', prefix: 'attraccess/wago', store, transport, device });
    await runtime.start();
    const save = jest.spyOn(store, 'save');

    await runtime['publishOperational']('measurements', {
      timestamp: '2026-09-01T00:00:00.000Z',
      channelId: 'meter',
      unit: 'percent',
      value: 42,
    });
    await runtime['publishOperational']('measurements', {
      timestamp: '2026-09-01T00:00:05.000Z',
      channelId: 'meter',
      unit: 'percent',
      value: 43,
    });

    expect(save).not.toHaveBeenCalled();
    expect(transport.published.filter((message) => message.topic.endsWith('/measurements'))).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ sequence: 1, value: 42 }),
      }),
    );
  });
  it('publishes canonical measurements in a boot stream', async () => {
    const measurementSnapshot: Snapshot = {
      version: 1,
      physicalPoints: [{ id: 'meter-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'meter',
          physicalPointId: 'meter-1',
          profile: 'site-meter',
          capabilities: ['measurement'],
          disconnectPolicy: { mode: 'hold' },
          measurement: { unit: 'percent', scale: 1, offset: 0 },
        },
      ],
    };
    device.values.set('751-9301:1', 0.5);
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(measurementSnapshot),
      snapshot: measurementSnapshot,
    });

    await runtime.publishMeasurements();

    const published = transport.published.find((message) => message.topic.endsWith('/measurements'));
    if (!published) throw new Error('measurement was not published');
    expect(published.payload).toMatchObject({
      channelId: 'meter',
      unit: 'millipercent',
      value: 500,
      kind: 'live',
      streamId: expect.any(String),
    });
  });
  it('does not publish from a sequence range whose reservation failed to save', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({ hardwareId: 'cc100-1', prefix: 'attraccess/wago', store, transport, device });
    await runtime.start();
    runtime['sequence'] = 100;
    runtime['categorySequences'].set('measurements', 100);
    runtime['reservedSequence'] = 100;
    runtime['state'].sequence = 100;
    const persist = store.save.bind(store);
    const save = jest.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full')).mockImplementation(persist);

    await expect(
      runtime['publishOperational']('measurements', {
        timestamp: '2026-09-01T00:00:00.000Z',
        channelId: 'meter',
        unit: 'percent',
        value: 42,
      }),
    ).rejects.toThrow('disk full');
    expect(runtime['reservedSequence']).toBe(100);
    expect(runtime['state'].sequence).toBe(100);

    await runtime['publishOperational']('measurements', {
      timestamp: '2026-09-01T00:00:05.000Z',
      channelId: 'meter',
      unit: 'percent',
      value: 43,
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(transport.published.filter((message) => message.topic.endsWith('/measurements'))).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ sequence: 101, value: 43 }),
      }),
    );
  });
  it('does not let a concurrent state save overwrite a sequence reservation', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({ hardwareId: 'cc100-1', prefix: 'attraccess/wago', store, transport, device });
    await runtime.start();
    runtime['sequence'] = 100;
    runtime['categorySequences'].set('measurements', 100);
    runtime['reservedSequence'] = 100;
    runtime['state'].sequence = 100;

    const publish = runtime['publishOperational']('measurements', {
      timestamp: '2026-09-01T00:00:00.000Z',
      channelId: 'meter',
      unit: 'percent',
      value: 42,
    });
    const saveClaim = runtime.receiveClaim({ username: 'controller', password: 'secret' });
    await Promise.all([publish, saveClaim]);

    await expect(store.load()).resolves.toEqual(
      expect.objectContaining({
        credentials: { username: 'controller', password: 'secret' },
        sequence: 200,
      }),
    );
  });
});
