import type { FakeBleHost } from './plugin-ble-fake';
import type { PluginBleCloseReason, PluginBleContext, PluginBleNotificationStream } from './plugin-ble';
import {
  ADDRESS,
  bytes,
  capture,
  countOps,
  PROFILE,
  seedBleContract,
  type BleContractFactory,
  type BleContractSubject,
} from './plugin-ble-contract.test-cases';

/**
 * Second half of the shared contract suite (split for the file-size limit): what a plugin can reach through its
 * handles, races inside one session, payload ownership, cleanup scope and links that share one address.
 */
export function defineBleContractSessionSuite(name: string, create: BleContractFactory): void {
  describe(`plugin BLE contract (session hardening): ${name}`, () => {
    let subject: BleContractSubject;
    let host: FakeBleHost;
    let a: PluginBleContext;
    let b: PluginBleContext;

    const endpoint = async (ctx = a, readerId = 1) =>
      ctx.createEndpoint({ readerId, address: ADDRESS, addressType: 'public', profileId: PROFILE.id });
    const open = async (readerId = 1) => a.openSession((await endpoint(a, readerId)).id);
    const ops = () => host.transcript.map((entry) => entry.op);

    beforeEach(async () => {
      subject = await create();
      host = subject.host;
      a = host.contextFor('plugin-a');
      b = host.contextFor('plugin-b');
      await seedBleContract(host, a);
    });

    afterEach(async () => {
      await subject.dispose();
    });

    describe('handles', () => {
      it('hands out a frozen session without internals', async () => {
        const session = await open();
        expect(Object.keys(session).sort()).toEqual([
          'close',
          'closed',
          'endpointId',
          'id',
          'mtu',
          'read',
          'subscribe',
          'unsubscribe',
          'write',
        ]);
        expect(Object.isFrozen(session)).toBe(true);
        expect(Object.getPrototypeOf(session)).toBe(Object.prototype);
        const raw = session as unknown as Record<string, unknown>;
        for (const internal of ['link', 'deps', 'tail', 'active', 'subscriptions', 'state', 'profile']) {
          expect(raw[internal]).toBeUndefined();
        }
        expect(Reflect.set(session, 'read', async () => bytes(0))).toBe(false);
        expect(Reflect.set(session, 'link', {})).toBe(false);
        await expect(session.read('info')).resolves.toEqual(bytes(1, 2, 3));
        await session.close();
      });

      it('hands out a frozen notification stream without its queue or capacity', async () => {
        const session = await open();
        const stream = await session.subscribe('events');
        expect(Reflect.ownKeys(stream)).toEqual(['next', 'unsubscribe', Symbol.asyncIterator]);
        expect(Object.isFrozen(stream)).toBe(true);
        expect(Object.getPrototypeOf(stream)).toBe(Object.prototype);
        const raw = stream as unknown as Record<string, unknown>;
        for (const internal of ['capacity', 'queue', 'waiters', 'terminal', 'push', 'end']) {
          expect(raw[internal]).toBeUndefined();
        }
        expect(Reflect.set(stream, 'next', async () => undefined)).toBe(false);
        await session.close();
      });
    });

    describe('subscriptions racing inside one session', () => {
      it('lets exactly one of two concurrent subscribes to one key win', async () => {
        const session = await open();
        const outcomes = await Promise.all([
          capture(session.subscribe('events')),
          capture(session.subscribe('events')),
        ]);
        expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
        expect(outcomes.find((outcome) => !outcome.ok)).toMatchObject({ error: { code: 'INVALID_ARGUMENT' } });
        expect(ops().filter((op) => op === 'subscribe')).toHaveLength(1);
        const winner = outcomes.find((outcome) => outcome.ok) as { value: PluginBleNotificationStream };
        host.notify(ADDRESS, 'fff2', bytes(1));
        expect((await winner.value.next()).value).toEqual(bytes(1));
        await session.close();
      });

      it('applies an unsubscribe queued right behind its subscribe', async () => {
        const session = await open();
        const subscribing = session.subscribe('events');
        const unsubscribing = session.unsubscribe('events');
        const stream = await subscribing;
        await unsubscribing;
        expect(ops()).toEqual(['connect', 'subscribe', 'unsubscribe']);
        host.notify(ADDRESS, 'fff2', bytes(1));
        await expect(stream.next({ timeoutMs: 100 })).rejects.toMatchObject({ code: 'CANCELLED' });
        // The key is free for a new subscription, which gets only what arrives after it.
        const fresh = await session.subscribe('events');
        host.notify(ADDRESS, 'fff2', bytes(2));
        expect((await fresh.next()).value).toEqual(bytes(2));
        await session.close();
      });

      it('does not let an old stream tear down the subscription that replaced it', async () => {
        const session = await open();
        const first = await session.subscribe('events');
        await session.unsubscribe('events');
        const second = await session.subscribe('events');
        await first.unsubscribe();
        expect(ops().filter((op) => op === 'unsubscribe')).toHaveLength(1);
        host.notify(ADDRESS, 'fff2', bytes(7));
        expect((await second.next()).value).toEqual(bytes(7));
        await session.close();
      });

      it('ends a for-await loop quietly when it breaks after the session closed', async () => {
        const session = await open();
        const stream = await session.subscribe('events');
        host.notify(ADDRESS, 'fff2', bytes(1));
        const seen: number[] = [];
        const loop = (async () => {
          for await (const notification of stream) {
            seen.push(notification.value[0]);
            await session.close();
            break;
          }
        })();
        await expect(loop).resolves.toBeUndefined();
        expect(seen).toEqual([1]);
        await expect(stream.unsubscribe()).resolves.toBeUndefined();
        expect(ops()).not.toContain('unsubscribe');
      });

      it('ends a for-await loop when the session closes while it waits', async () => {
        const session = await open();
        const stream = await session.subscribe('events');
        const loop = (async () => {
          for await (const notification of stream) void notification;
          return 'ended';
        })();
        await host.advance(1);
        await session.close();
        await expect(loop).resolves.toBe('ended');
      });
    });

    describe('payload ownership', () => {
      it('sends the bytes as they were when write was called', async () => {
        const session = await open();
        const reading = capture(session.read('slow', { timeoutMs: 30_000 }));
        const payload = bytes(1, 2, 3);
        const writing = session.write('info', payload);
        payload[0] = 99;
        payload.fill(0xee, 1);
        await host.advance(20_000);
        await reading;
        await writing;
        const sent = host.transcript.find((entry) => entry.op === 'write');
        expect(sent?.bytes).toEqual(bytes(1, 2, 3));
        await session.close();
      });

      it('checks bounds on the real bytes and refuses look-alikes before the transport', async () => {
        const session = await open();
        class LyingBytes extends Uint8Array {}
        Object.defineProperty(LyingBytes.prototype, 'byteLength', { get: () => 1 });
        Object.defineProperty(LyingBytes.prototype, 'length', { get: () => 1 });
        const before = host.transcript.length;
        await expect(session.write('info', new LyingBytes(100))).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
        await expect(session.write('info', new Proxy(new Uint8Array(4), {}))).rejects.toMatchObject({
          code: 'INVALID_ARGUMENT',
        });
        const tagged = { [Symbol.toStringTag]: 'Uint8Array', byteLength: 2, length: 2, 0: 1, 1: 2 };
        await expect(session.write('info', tagged as never)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
        expect(host.transcript).toHaveLength(before);
        await session.write('info', new LyingBytes([4, 5]));
        expect(host.transcript.at(-1)?.bytes).toEqual(bytes(4, 5));
        expect(host.transcript.at(-1)?.bytes).not.toBeInstanceOf(LyingBytes);
        await session.close();
      });
    });

    describe('cleanup scope', () => {
      const OTHER = 'aa:bb:cc:dd:ee:02';

      /** Plugin B's own device, endpoint and session through reader 2. */
      const otherPluginSession = async () => {
        host.addPeripheral({
          readerIds: [1, 2],
          address: OTHER,
          addressType: 'random',
          advertisement: {},
          characteristics: { fff1: { value: bytes(4) } },
        });
        b.registerProfile(PROFILE);
        const created = await b.createEndpoint({
          readerId: 2,
          address: OTHER,
          addressType: 'random',
          profileId: PROFILE.id,
        });
        return b.openSession(created.id);
      };

      it.each<[string, (host: FakeBleHost) => Promise<void>, PluginBleCloseReason]>([
        ['plugin A shuts down', (target) => target.shutdownPlugin('plugin-a'), 'shutdown'],
        ['plugin A is uninstalled', (target) => target.uninstallPlugin('plugin-a'), 'endpoint-deleted'],
        ['reader 1 opts out', (target) => target.setReaderAccess(1, false), 'reader-access-revoked'],
      ])('leaves another plugin’s session and endpoint alone when %s', async (_label, action, reason) => {
        const mine = await open();
        const theirs = await otherPluginSession();
        await action(host);
        await expect(mine.closed).resolves.toEqual({ reason });
        expect(host.openSessions()).toEqual([expect.objectContaining({ pluginId: 'plugin-b', readerId: 2 })]);
        await expect(theirs.read('info')).resolves.toEqual(bytes(4));
        await expect(b.listEndpoints()).resolves.toHaveLength(1);
        expect(countOps(host, 'disconnect')).toBe(1);
        await theirs.close();
      });

      it('closes only the sessions through the reader that opted out', async () => {
        const viaOne = await open(1);
        const viaTwo = await open(2);
        await host.setReaderAccess(1, false);
        await expect(viaOne.closed).resolves.toEqual({ reason: 'reader-access-revoked' });
        await expect(viaTwo.read('info')).resolves.toEqual(bytes(1, 2, 3));
        expect(host.openSessions()).toEqual([expect.objectContaining({ readerId: 2 })]);
        await viaTwo.close();
      });
    });

    describe('one address through two readers', () => {
      it('delivers to both sessions and keeps one working after the other closes', async () => {
        const one = await open(1);
        const two = await open(2);
        expect(host.transcript.filter((entry) => entry.op === 'connect').map((entry) => entry.readerId)).toEqual([
          1, 2,
        ]);
        const first = await one.subscribe('events');
        const second = await two.subscribe('events');
        host.notify(ADDRESS, 'fff2', bytes(1));
        expect((await first.next()).value).toEqual(bytes(1));
        expect((await second.next()).value).toEqual(bytes(1));

        await one.close();
        expect(host.transcript.find((entry) => entry.op === 'disconnect')).toMatchObject({ readerId: 1 });
        host.notify(ADDRESS, 'fff2', bytes(2));
        expect((await second.next()).value).toEqual(bytes(2));
        await expect(two.read('info')).resolves.toEqual(bytes(1, 2, 3));
        expect(host.openSessions()).toEqual([expect.objectContaining({ readerId: 2 })]);
        await two.close();
      });

      it('keeps one session’s subscription out of the other session', async () => {
        const one = await open(1);
        const two = await open(2);
        const only = await one.subscribe('events');
        host.notify(ADDRESS, 'fff2', bytes(3));
        expect((await only.next()).value).toEqual(bytes(3));
        // Session two never subscribed: it can subscribe now and sees only what comes after.
        const late = await two.subscribe('events');
        host.notify(ADDRESS, 'fff2', bytes(4));
        expect((await late.next()).value).toEqual(bytes(4));
        expect((await only.next()).value).toEqual(bytes(4));
        await one.close();
        await two.close();
      });
    });
  });
}
