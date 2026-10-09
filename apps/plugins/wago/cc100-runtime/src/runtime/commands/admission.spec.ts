import { MemoryDeviceAdapter } from '../../io/adapters';
import { MAX_PENDING_CHANNEL_WRITES, JsonStateStore, WagoRuntime, hash, type Snapshot } from '../../runtime';
import {
  TestTransport,
  snapshot,
  desired,
  commands,
  validCommand,
  createRuntimeFixture,
} from '../../runtime.test-utils';

describe('WagoRuntime', () => {
  let transport: TestTransport;
  let device: MemoryDeviceAdapter;
  let runtime: WagoRuntime;
  beforeEach(async () => {
    ({ transport, device, runtime } = await createRuntimeFixture());
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

  it('rejects pulses on switched outputs before any device write or command reservation', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({
      pairingCode: 'fixture',
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store,
      transport,
      device,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    const write = jest.spyOn(device, 'write');
    await transport.send(commands, validCommand({ action: 'pulse' }));
    expect(write).not.toHaveBeenCalled();
    expect((await store.load())?.commandIds).not.toContain('command-1');
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ id: 'command-1', status: 'rejected', code: 'unsupported_operation' }),
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
      pairingCode: 'fixture',
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
});
