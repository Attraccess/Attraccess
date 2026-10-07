import { MemoryDeviceAdapter } from './adapters';
import { JsonStateStore, WagoRuntime, hash } from './runtime';
import {
  TestTransport,
  snapshot,
  pulsedSnapshot,
  desired,
  commands,
  validCommand,
  createRuntimeFixture,
} from './runtime.test-utils';

describe('WagoRuntime', () => {
  let transport: TestTransport;
  let device: MemoryDeviceAdapter;
  let runtime: WagoRuntime;
  beforeEach(async () => {
    ({ transport, device, runtime } = await createRuntimeFixture());
  });
  it('does not repeat an unexpired pulse after a runtime reboot', async () => {
    const snapshot = pulsedSnapshot;
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
});
