import { MemoryDeviceAdapter } from '../../io/adapters';
import { JsonStateStore, MAX_PENDING_CHANNEL_WRITES, WagoRuntime, hash, type Snapshot } from '../../runtime';
import {
  TestTransport,
  commands,
  createRuntimeFixture,
  desired,
  snapshot,
  validCommand,
} from '../../runtime.test-utils';

describe('WagoRuntime command admission and ordering', () => {
  let transport: TestTransport;

  let device: MemoryDeviceAdapter;

  let runtime: WagoRuntime;

  beforeEach(async () => {
    ({ transport, device, runtime } = await createRuntimeFixture());
  });

  it.each(['{', 'null', '{}', '{"id":"bad","channelId":"load","action":"unexpected"}'])(
    'ignores malformed command %s without performing device writes',
    async (payload) => {
      const write = jest.spyOn(device, 'write');
      const before = transport.published.length;
      await expect(runtime.receiveCommand(Buffer.from(payload))).resolves.toBeUndefined();
      expect(write).not.toHaveBeenCalled();
      expect(transport.published).toHaveLength(before);
    },
  );

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
      transport: transport,
      device: delayedDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });
    await Promise.all([transport.send(commands, validCommand()), transport.send(commands, validCommand())]);
    expect(writes).toEqual([true]);
  });

  it('rejects expired commands before writing the device', async () => {
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });

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
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });

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
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
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
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });

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

  it('allows a command ID to be reused after its persisted expiry', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    await store.save({
      accepted: { revision: 1, contentHash: hash(snapshot), snapshot: snapshot },
      outputs: {},
      commandIds: ['expired-command'],
      commandExpiries: { 'expired-command': '2000-01-01T00:00:00.000Z' },
    });
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport: transport,
      device: device,
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
      transport: transport,
      device: flakyDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });
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
      transport: transport,
      device: delayedDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });

    const first = transport.send(commands, validCommand({ id: 'first', value: true }));
    const second = transport.send(commands, validCommand({ id: 'second', value: false }));
    await started;
    expect(writes).toEqual([true]);
    releaseFirst();
    await Promise.all([first, second]);

    expect(writes).toEqual([true, false]);
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
      transport: transport,
      device: delayedDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });

    const first = transport.send(commands, validCommand({ id: 'first' }));
    const second = transport.send(commands, validCommand({ id: 'second' }));
    await started;
    const replacement = transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(snapshot),
      snapshot: snapshot,
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
      transport: transport,
      device: reservingDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });

    await transport.send(commands, validCommand());

    await expect(store.load()).resolves.toEqual(expect.objectContaining({ commandIds: ['command-1'] }));
  });

  it('acknowledges duplicate commands and enforces immediate disconnect policy', async () => {
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });
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
      transport: transport,
      device: slowDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });

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
