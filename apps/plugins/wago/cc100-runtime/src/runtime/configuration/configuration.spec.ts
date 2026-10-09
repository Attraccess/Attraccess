import { MemoryDeviceAdapter } from '../../io/adapters';
import { JsonStateStore, WagoRuntime, hash, validateSnapshot, type Snapshot } from '../../runtime';
import {
  TestTransport,
  commands,
  createRuntimeFixture,
  desired,
  pulsedSnapshot,
  snapshot,
  validCommand,
} from '../../runtime.test-utils';

describe('WagoRuntime configuration', () => {
  let transport: TestTransport;

  let device: MemoryDeviceAdapter;

  let runtime: WagoRuntime;

  beforeEach(async () => {
    ({ transport, device, runtime } = await createRuntimeFixture());
  });

  it('applies a complete valid retained snapshot and reports its revision', async () => {
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: { revision: 1, contentHash: hash(snapshot), errors: [] },
        retain: true,
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
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });
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
      transport.send(desired, {
        protocolVersion: 1,
        revision: 1,
        contentHash: hash(malformed),
        snapshot: malformed,
      }),
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

  it.each([
    { unit: 'unknown', scale: 1, offset: 0 },
    { unit: 'watt', scale: Number.NaN, offset: 0 },
    { unit: 'watt', scale: 1, offset: Number.POSITIVE_INFINITY },
  ])('rejects invalid measurement metadata: %j', (measurement) => {
    const errors = validateSnapshot({
      ...snapshot,
      logicalChannels: [
        {
          ...snapshot.logicalChannels[0],
          capabilities: ['output', 'measurement'],
          measurement,
        },
      ],
    });

    expect(errors).toContainEqual(expect.objectContaining({ code: 'invalid_measurement' }));
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
          capabilities: ['output', 'guard'],
          guard: { channelId: 'interlock', when: 'on' },
        },
      ],
    };
    device.values.set('751-9301:1', true);
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(guarded),
      snapshot: guarded,
    });
    await transport.send(commands, validCommand());
    expect(device.values.get('751-9301:0')).toBe(true);
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
      transport: transport,
      device: delayedDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(pulsedSnapshot),
      snapshot: pulsedSnapshot,
    });
    await transport.send(commands, validCommand({ action: 'pulse' }));

    const revisionTwo = transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });
    await started;
    const revisionThree = transport.send(desired, {
      protocolVersion: 1,
      revision: 3,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });
    releaseShutdown();
    await Promise.all([revisionTwo, revisionThree]);

    await transport.send(commands, validCommand({ id: 'revision-three', expectedConfigurationRevision: 3 }));
    expect(device.values.get('751-9301:0')).toBe(true);
  });

  it('keeps the previous configuration active when persisting a replacement fails', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport: transport,
      device: device,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });
    const persist = store.save.bind(store);
    jest.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full')).mockImplementation(persist);

    await transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });
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
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(invalid),
      snapshot: invalid,
    });

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
});
