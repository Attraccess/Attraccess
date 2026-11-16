import { PluginBleContext } from './plugin-ble';
import { createFakeBleHost } from './plugin-ble-fake';

/** A vendor plugin in miniature: it owns the semantics (a toy command protocol), core owns the transport. */
class ToyLockPlugin {
  private readonly profile;

  constructor(private readonly ble: PluginBleContext) {
    this.profile = ble.registerProfile({
      id: 'toy-lock',
      advertisement: { serviceUuids: ['fff0'], namePrefix: 'Toy' },
      services: [
        {
          uuid: 'fff0',
          characteristics: [
            { key: 'command', uuid: 'fff1', operations: ['write'], maxWriteBytes: 8 },
            { key: 'status', uuid: 'fff2', operations: ['read', 'notify'], maxReadBytes: 4, maxNotificationBytes: 4 },
          ],
        },
      ],
    });
  }

  async pair(readerId: number) {
    const [found] = await this.ble.scan(readerId, this.profile.id);
    return this.ble.createEndpoint({
      readerId,
      address: found.address,
      addressType: found.addressType,
      profileId: this.profile.id,
      label: found.name,
    });
  }

  /** Sends the unlock command and waits for the lock to confirm through a notification. */
  unlock(endpointId: string) {
    return this.ble.withSession(endpointId, async (session) => {
      const events = await session.subscribe('status');
      const before = await session.read('status');
      await session.write('command', Uint8Array.of(0x01));
      const confirmation = await events.next({ timeoutMs: 2000 });
      await session.unsubscribe('status');
      return { before: before[0], after: confirmation.value[0] };
    });
  }
}

describe('createFakeBleHost with a plugin under test', () => {
  const setup = () => {
    const host = createFakeBleHost();
    host.addReader({ readerId: 1, name: 'Door reader', allowPluginBle: true });
    host.addPeripheral({
      readerId: 1,
      address: 'aa:bb:cc:00:00:01',
      addressType: 'public',
      advertisement: { name: 'Toy lock', serviceUuids: ['fff0'] },
      characteristics: {
        fff1: { onWrite: () => host.notify('AA:BB:CC:00:00:01', 'fff2', Uint8Array.of(2)) },
        fff2: { value: Uint8Array.of(1) },
      },
    });
    return { host, plugin: new ToyLockPlugin(host.contextFor('toy-plugin')) };
  };

  it('runs scan, pair, unlock and leaves a transcript to assert on', async () => {
    const { host, plugin } = setup();
    const endpoint = await plugin.pair(1);
    expect(endpoint).toMatchObject({ address: 'AA:BB:CC:00:00:01', label: 'Toy lock', profileId: 'toy-lock' });
    await expect(plugin.unlock(endpoint.id)).resolves.toEqual({ before: 1, after: 2 });
    expect(host.transcript.map((entry) => entry.op)).toEqual([
      'scan',
      'connect',
      'subscribe',
      'read',
      'write',
      'unsubscribe',
      'disconnect',
    ]);
    expect(host.openSessions()).toEqual([]);
  });

  it('keeps plugins apart while sharing one fake host', async () => {
    const { host, plugin } = setup();
    const endpoint = await plugin.pair(1);
    const intruder = new ToyLockPlugin(host.contextFor('other-plugin'));
    await expect(intruder.pair(1)).rejects.toMatchObject({ code: 'ENDPOINT_CONFLICT' });
    await expect(intruder.unlock(endpoint.id)).rejects.toMatchObject({ code: 'ENDPOINT_NOT_FOUND' });
  });

  it('simulates a host that is not ready yet', async () => {
    const host = createFakeBleHost({ ready: false });
    const ble = host.contextFor('early');
    expect(() =>
      ble.registerProfile({
        id: 'x',
        services: [
          { uuid: 'fff0', characteristics: [{ key: 'a', uuid: 'fff1', operations: ['read'], maxReadBytes: 1 }] },
        ],
      }),
    ).not.toThrow();
    await expect(ble.listReaders()).rejects.toMatchObject({ code: 'NOT_READY', retryable: true });
    host.setReady(true);
    await expect(ble.listReaders()).resolves.toEqual([]);
  });

  it('moves time only through advance and injects failures once', async () => {
    const { host, plugin } = setup();
    const endpoint = await plugin.pair(1);
    host.failNext('connect', 'CONNECTION_FAILED');
    await expect(plugin.unlock(endpoint.id)).rejects.toMatchObject({ code: 'CONNECTION_FAILED' });
    const waiting = plugin.unlock(endpoint.id).catch((error: { code: string }) => error.code);
    host.addPeripheral({
      readerId: 1,
      address: 'AA:BB:CC:00:00:01',
      addressType: 'public',
      advertisement: {},
      characteristics: { fff1: {}, fff2: { value: Uint8Array.of(1) } },
    });
    await host.advance(2000);
    await expect(waiting).resolves.toBeDefined();
  });

  it('removes readers, closing sessions and dropping their endpoints', async () => {
    const { host, plugin } = setup();
    const ble = host.contextFor('toy-plugin');
    const endpoint = await plugin.pair(1);
    const session = await ble.openSession(endpoint.id);
    await host.removeReader(1);
    await expect(session.closed).resolves.toEqual({ reason: 'reader-access-revoked' });
    await expect(ble.listEndpoints()).resolves.toEqual([]);
    host.setReaderAccess(99, true);
    host.setReaderAvailable(99, false);
  });
});
