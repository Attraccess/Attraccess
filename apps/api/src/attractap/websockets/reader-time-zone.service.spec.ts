import type { ReaderUiProvider } from '@attraccess/plugins-backend-sdk';
import { ReaderTimeZoneChangedEvent } from '../events';
import { ReaderTimeZoneService, TIME_ZONE_RETRY_MAX_MS, TIME_ZONE_RETRY_MIN_MS } from './reader-time-zone.service';

type Provider = Partial<ReaderUiProvider>;

function setup(providers: { plugin: string; provider: Provider }[], resourceIds = [1]) {
  const alerts = { raise: jest.fn().mockResolvedValue({}) };
  const sent: string[] = [];
  const socket = { readerId: 7, readyState: 1, send: (data: string) => sent.push(data) };
  const websocket = { sockets: new Map([['s', socket]]) };
  const attractap = {
    findReaderById: jest.fn().mockResolvedValue({ id: 7, resources: resourceIds.map((id) => ({ id })) }),
  };
  const registry = { providers: () => providers };
  const events = { emit: jest.fn() };
  const service = new ReaderTimeZoneService(
    registry as never,
    alerts as never,
    attractap as never,
    websocket as never,
    events as never,
  );
  return { service, alerts, sent, providers, attractap, events, websocket };
}

/** The `ReaderTimeZoneChangedEvent`s the service emitted, as reader ids. */
const listResends = (events: { emit: jest.Mock }) =>
  events.emit.mock.calls
    .filter(([name]) => name === ReaderTimeZoneChangedEvent.EVENT_NAME)
    .map(([, event]) => (event as ReaderTimeZoneChangedEvent).readerId);

/** What sign-in does for reader 7: resolve the zone, then build `serverTime` from it. */
async function signIn(service: ReaderTimeZoneService, resourceIds?: number[], at = new Date()) {
  await service.resolve(7, resourceIds);
  return service.serverTimeFor(7, at);
}

/** Lets every pending promise callback run. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

const zone = (value: string | undefined): Provider => ({ getSlotContributions: () => [], getTimeZone: () => value });
const dynamic = (answer: () => string | undefined | Promise<string | undefined>): Provider => ({
  getSlotContributions: () => [],
  getTimeZone: answer,
});

describe('ReaderTimeZoneService', () => {
  afterEach(() => jest.useRealTimers());

  it('uses the first valid zone in host order', async () => {
    const { service } = setup([
      { plugin: 'a', provider: zone(undefined) },
      { plugin: 'b', provider: zone('Europe/Berlin') },
      { plugin: 'c', provider: zone('Asia/Tokyo') },
    ]);
    await expect(service.resolve(7)).resolves.toBe('Europe/Berlin');
    expect(service.cachedZone(7)).toBe('Europe/Berlin');
  });

  it('keeps a slower plugin that answers in time over a faster one ranked lower', async () => {
    // Fake timers: a stalled test process must not hit the real 1.5 s timeout while the answer is pending.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    let release: (value: string) => void = () => undefined;
    const slow = new Promise<string>((resolve) => (release = resolve));
    const { service } = setup([
      { plugin: 'a', provider: dynamic(() => slow) },
      { plugin: 'b', provider: zone('Asia/Tokyo') },
    ]);
    const pending = service.resolve(7);
    await settle();
    release('Europe/Berlin');
    await expect(pending).resolves.toBe('Europe/Berlin');
  });

  it('asks the resources by id and, for each resource, the plugins in host order', async () => {
    const answers: Record<string, Record<number, string | undefined>> = {
      a: { 1: undefined, 2: 'Asia/Tokyo' },
      b: { 1: 'Europe/Berlin', 2: 'America/New_York' },
    };
    const byResource = (plugin: string): Provider => ({
      getSlotContributions: () => [],
      getTimeZone: ({ resourceId }) => answers[plugin][resourceId],
    });
    // The reader relation lists resource 2 first; host order still starts with resource 1.
    const { service, alerts } = setup(
      [
        { plugin: 'a', provider: byResource('a') },
        { plugin: 'b', provider: byResource('b') },
      ],
      [2, 1],
    );
    await expect(service.resolve(7)).resolves.toBe('Europe/Berlin');
    expect(alerts.raise).toHaveBeenCalledWith('time-zone-conflict', expect.stringContaining('b uses Europe/Berlin'), {
      plugin: 'a',
      readerId: 7,
    });
  });

  it('compares canonical zone names, so spellings and links of one zone are no conflict', async () => {
    const { service, alerts } = setup([
      { plugin: 'a', provider: zone('europe/berlin') },
      { plugin: 'b', provider: zone('Europe/Berlin') },
    ]);
    // The first plugin's own spelling is what the reader gets.
    await expect(service.resolve(7)).resolves.toBe('europe/berlin');
    const links = setup([
      { plugin: 'a', provider: zone('Europe/Kyiv') },
      { plugin: 'b', provider: zone('Europe/Kiev') },
    ]);
    await expect(links.service.resolve(7)).resolves.toBe('Europe/Kyiv');
    expect(alerts.raise).not.toHaveBeenCalled();
    expect(links.alerts.raise).not.toHaveBeenCalled();
  });

  it('names the zones in the alert as the plugins spelled them', async () => {
    const { service, alerts } = setup([
      { plugin: 'a', provider: zone('Europe/Kyiv') },
      { plugin: 'b', provider: zone('Asia/Kolkata') },
    ]);
    await service.resolve(7);
    expect(alerts.raise).toHaveBeenCalledWith(
      'time-zone-conflict',
      'Conflicting reader time zones: a uses Europe/Kyiv, b uses Asia/Kolkata. The reader shows Europe/Kyiv.',
      { plugin: 'b', readerId: 7 },
    );
  });

  it('ignores an invalid zone', async () => {
    const { service } = setup([
      { plugin: 'a', provider: zone('Not/AZone') },
      { plugin: 'b', provider: zone('Asia/Tokyo') },
    ]);
    await expect(service.resolve(7)).resolves.toBe('Asia/Tokyo');
  });

  it('ignores offset-style names that are no IANA zones, and keeps real ones', async () => {
    const { service } = setup([
      { plugin: 'a', provider: zone('+23:59') },
      { plugin: 'b', provider: zone('-05:00') },
      { plugin: 'c', provider: zone('Etc/GMT-14') },
    ]);
    await expect(service.resolve(7)).resolves.toBe('Etc/GMT-14');
    expect(service.readerUtcOffsetMinutes(7, new Date('2026-07-15T12:00:00Z'))).toBe(840);
  });

  it('counts an exception as no opinion and falls back to the process zone', async () => {
    const { service } = setup([
      {
        plugin: 'a',
        provider: {
          getSlotContributions: () => [],
          getTimeZone: () => {
            throw new Error('boom');
          },
        },
      },
    ]);
    await expect(service.resolve(7)).resolves.toBeNull();
    const at = new Date('2026-07-15T12:00:00Z');
    expect(service.readerUtcOffsetMinutes(7, at)).toBe(-at.getTimezoneOffset() || 0);
  });

  it('keeps the cached zone when the provider times out', async () => {
    jest.useFakeTimers();
    let answer: Promise<string | undefined> = Promise.resolve('Europe/Berlin');
    const { service } = setup([
      { plugin: 'a', provider: { getSlotContributions: () => [], getTimeZone: () => answer } },
    ]);
    await expect(service.resolve(7)).resolves.toBe('Europe/Berlin');
    answer = new Promise(() => undefined);
    const pending = service.resolve(7);
    await jest.advanceTimersByTimeAsync(1600);
    await expect(pending).resolves.toBe('Europe/Berlin');
    expect(service.cachedZone(7)).toBe('Europe/Berlin');
  });

  it('keeps the first zone and raises one alert per reader and zone pair', async () => {
    const { service, alerts } = setup([
      { plugin: 'a', provider: zone('Europe/Berlin') },
      { plugin: 'b', provider: zone('Asia/Tokyo') },
    ]);
    await expect(service.resolve(7)).resolves.toBe('Europe/Berlin');
    await service.resolve(7);
    expect(alerts.raise).toHaveBeenCalledTimes(1);
    expect(alerts.raise).toHaveBeenCalledWith('time-zone-conflict', expect.stringContaining('Asia/Tokyo'), {
      plugin: 'b',
      readerId: 7,
    });
    await service.resolve(8, [1]);
    await service.resolve(8, [1]);
    await service.resolve(7);
    expect(alerts.raise).toHaveBeenCalledTimes(2);
    expect(alerts.raise).toHaveBeenLastCalledWith('time-zone-conflict', expect.any(String), {
      plugin: 'b',
      readerId: 8,
    });
  });

  it('raises one alert for a zone pair whichever plugin holds which zone', async () => {
    let first = 'Europe/Berlin';
    let second = 'Asia/Tokyo';
    const { service, alerts } = setup([
      { plugin: 'a', provider: dynamic(() => first) },
      { plugin: 'b', provider: dynamic(() => second) },
    ]);
    await service.resolve(7);
    [first, second] = [second, first];
    await expect(service.resolve(7)).resolves.toBe('Asia/Tokyo');
    expect(alerts.raise).toHaveBeenCalledTimes(1);
  });

  it('alerts again when a conflict ended and returned', async () => {
    let second: string | undefined = 'Asia/Tokyo';
    const { service, alerts } = setup([
      { plugin: 'a', provider: zone('Europe/Berlin') },
      { plugin: 'b', provider: dynamic(() => second) },
    ]);
    await service.resolve(7);
    expect(alerts.raise).toHaveBeenCalledTimes(1);
    second = 'Europe/Berlin';
    await service.resolve(7);
    await service.resolve(7);
    expect(alerts.raise).toHaveBeenCalledTimes(1);
    second = 'Asia/Tokyo';
    await service.resolve(7);
    await service.resolve(7);
    expect(alerts.raise).toHaveBeenCalledTimes(2);
  });

  it('alerts again when the conflict is gone because only one plugin answers', async () => {
    let second: string | undefined = 'Asia/Tokyo';
    const { service, alerts } = setup([
      { plugin: 'a', provider: zone('Europe/Berlin') },
      { plugin: 'b', provider: dynamic(() => second) },
    ]);
    await service.resolve(7);
    second = undefined;
    await service.resolve(7);
    second = 'Asia/Tokyo';
    await service.resolve(7);
    expect(alerts.raise).toHaveBeenCalledTimes(2);
  });

  it('never throws: a failing reader lookup falls back to the cached zone', async () => {
    const { service, attractap } = setup([{ plugin: 'a', provider: zone('Europe/Berlin') }]);
    await service.resolve(7);
    attractap.findReaderById.mockRejectedValue(new Error('db down'));
    await expect(service.resolve(7)).resolves.toBe('Europe/Berlin');
    await expect(signIn(service, undefined, new Date('2026-07-15T12:00:00Z'))).resolves.toMatchObject({
      utcOffsetMinutes: 120,
    });
  });

  it('never throws: without a cached zone the process zone applies', async () => {
    const { service, attractap } = setup([{ plugin: 'a', provider: zone('Europe/Berlin') }]);
    attractap.findReaderById.mockRejectedValue(new Error('db down'));
    const at = new Date('2026-07-15T12:00:00Z');
    await expect(signIn(service, undefined, at)).resolves.toMatchObject({
      utcOffsetMinutes: -at.getTimezoneOffset() || 0,
    });
  });

  it('drops a slow older answer when a newer resolve finished first', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    let release: (value: string) => void = () => undefined;
    const slow = new Promise<string>((resolve) => (release = resolve));
    const answers = [slow, Promise.resolve('Asia/Tokyo')];
    const { service } = setup([{ plugin: 'a', provider: dynamic(() => answers.shift()) }]);
    const older = service.resolve(7);
    await expect(service.resolve(7)).resolves.toBe('Asia/Tokyo');
    release('Europe/Berlin');
    await older;
    expect(service.cachedZone(7)).toBe('Asia/Tokyo');
  });

  it('keeps the cached zone when a higher-ranked plugin times out and a later one answers another zone', async () => {
    jest.useFakeTimers();
    let first: Promise<string | undefined> = Promise.resolve('Europe/Berlin');
    const { service } = setup([
      { plugin: 'a', provider: dynamic(() => first) },
      { plugin: 'b', provider: zone('Asia/Tokyo') },
    ]);
    await expect(service.resolve(7)).resolves.toBe('Europe/Berlin');
    first = new Promise(() => undefined);
    const pending = service.resolve(7);
    await jest.advanceTimersByTimeAsync(1600);
    await expect(pending).resolves.toBe('Europe/Berlin');
    expect(service.cachedZone(7)).toBe('Europe/Berlin');
  });

  it('forgets a reader: zone, sent offset, conflict alerts and a resolve still in flight', async () => {
    let release: (value: string) => void = () => undefined;
    const { service, alerts, sent } = setup([
      { plugin: 'a', provider: zone('Europe/Berlin') },
      { plugin: 'b', provider: zone('Asia/Tokyo') },
    ]);
    await signIn(service);
    expect(service.cachedZone(7)).toBe('Europe/Berlin');
    service.forget(7);
    expect(service.cachedZone(7)).toBeNull();
    // The reader's offset was dropped too: the same zone is pushed again.
    await service.onInvalidate({ pluginName: 'a', scope: { readerId: 7 } });
    expect(sent).toHaveLength(1);
    // The conflict alert comes back for a reader that reappears.
    expect(alerts.raise).toHaveBeenCalledTimes(2);

    const slow = new Promise<string>((resolve) => (release = resolve));
    const lone = setup([{ plugin: 'a', provider: dynamic(() => slow) }]);
    const pending = lone.service.resolve(7);
    lone.service.onReaderDeleted({ readerId: 7 });
    release('Asia/Tokyo');
    await pending;
    expect(lone.service.cachedZone(7)).toBeNull();
  });

  it('keeps no state for a deleted reader, a heartbeat without a reader or a reader forgotten mid-resolve', async () => {
    const { service } = setup([{ plugin: 'a', provider: zone('Europe/Berlin') }]);
    void service.onReaderUpdated({ reader: { id: 7, resources: [] } } as never);
    expect(service.resourceGeneration(7)).toBe(1);
    service.onReaderDeleted({ readerId: 7 });
    expect(service.resourceGeneration(7)).toBe(0);

    service.serverTimeFor(null as unknown as number);
    const internals = service as unknown as Record<string, Map<number | null, unknown>>;
    expect(internals.sentOffsets.size).toBe(0);

    const failing = setup([{ plugin: 'a', provider: zone('Europe/Berlin') }]);
    let fail = (_error: Error): void => undefined;
    const failingInternals = failing.service as unknown as {
      resolveZone: () => Promise<string | null>;
      latestResolve: Map<number, number>;
      retries: Map<number, unknown>;
    };
    failingInternals.resolveZone = () => new Promise((_resolve, reject) => (fail = reject));
    failingInternals.latestResolve.set(7, 1);
    const pending = failing.service.resolve(7);
    failing.service.forget(7);
    fail(new Error('database gone'));
    await pending;
    expect(failingInternals.retries.has(7)).toBe(false);
  });

  it('sends the zone offset in serverTime: +60 in winter and +120 in summer for Europe/Berlin', async () => {
    const { service } = setup([{ plugin: 'a', provider: zone('Europe/Berlin') }]);
    const winter = await signIn(service, undefined, new Date('2026-01-15T12:00:00Z'));
    expect(winter.utcOffsetMinutes).toBe(60);
    const summer = service.serverTimeFor(7, new Date('2026-07-15T12:00:00Z'));
    expect(summer.utcOffsetMinutes).toBe(120);
    expect(service.readerUtcOffsetMinutes(7, new Date('2026-07-15T12:00:00Z'))).toBe(120);
  });

  it('pushes a changed offset to the reader at once, and only when it changed', async () => {
    let current: string | undefined = 'Europe/Berlin';
    const { service, sent, events } = setup([
      { plugin: 'a', provider: { getSlotContributions: () => [], getTimeZone: () => current } },
    ]);
    await signIn(service);
    await service.onInvalidate({ pluginName: 'a', scope: { resourceId: 1 } });
    expect(sent).toHaveLength(0);
    current = 'Asia/Tokyo';
    await service.onInvalidate({ pluginName: 'a', scope: { resourceId: 1 } });
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0])).toMatchObject({ event: 'HEARTBEAT', serverTime: { utcOffsetMinutes: 540 } });
    // The resource list's session start times follow the new zone too.
    expect(listResends(events)).toEqual([7]);
    await service.onInvalidate({ pluginName: 'a', scope: { readerId: 7 } });
    expect(sent).toHaveLength(1);
    expect(listResends(events)).toEqual([7]);
  });

  it('resends the resource list when the zone changes but the offset stays', async () => {
    let current = 'Europe/Berlin';
    const { service, sent, events } = setup([{ plugin: 'a', provider: dynamic(() => current) }]);
    await signIn(service, [1], new Date());
    current = 'Europe/Paris';
    await service.onInvalidate({ pluginName: 'a', scope: { readerId: 7 } });
    expect(service.cachedZone(7)).toBe('Europe/Paris');
    expect(sent).toHaveLength(0);
    expect(listResends(events)).toEqual([7]);
  });

  it('ignores invalidations of plugins that declare no zone, without asking anyone', async () => {
    const getTimeZone = jest.fn(() => 'Asia/Tokyo');
    const { service, attractap, sent } = setup([
      { plugin: 'a', provider: { getSlotContributions: () => [], getTimeZone } },
      { plugin: 'widgets', provider: { getSlotContributions: () => [] } },
    ]);
    await service.onInvalidate({ pluginName: 'widgets', scope: {} });
    await service.onInvalidate({ pluginName: 'not-loaded', scope: {} });
    expect(getTimeZone).not.toHaveBeenCalled();
    expect(attractap.findReaderById).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it('uses the resource ids from sign-in and reader updates instead of loading the reader again', async () => {
    const { service, attractap } = setup([{ plugin: 'a', provider: zone('Asia/Tokyo') }]);
    await signIn(service, [1]);
    await service.onInvalidate({ pluginName: 'a', scope: { resourceId: 1 } });
    await service.onReaderUpdated({ reader: { id: 7, resources: [{ id: 2 }] } } as never);
    await service.onInvalidate({ pluginName: 'a', scope: { resourceId: 2 } });
    expect(attractap.findReaderById).not.toHaveBeenCalled();
  });

  it('coalesces invalidations of a reader into the running refresh and one more', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    let release: (value: string) => void = () => undefined;
    const getTimeZone = jest.fn(() => new Promise<string>((resolve) => (release = resolve)));
    const { service } = setup([{ plugin: 'a', provider: { getSlotContributions: () => [], getTimeZone } }]);
    const burst = [1, 2, 3].map(() => service.onInvalidate({ pluginName: 'a', scope: { readerId: 7 } }));
    await settle();
    expect(getTimeZone).toHaveBeenCalledTimes(1);
    release('Asia/Tokyo');
    await settle();
    expect(getTimeZone).toHaveBeenCalledTimes(2);
    release('Asia/Tokyo');
    await Promise.all(burst);
    expect(getTimeZone).toHaveBeenCalledTimes(2);
  });

  it('re-resolves on a reader update with its new resources and pushes the new offset', async () => {
    const { service, sent, events } = setup([{ plugin: 'a', provider: zone('Asia/Tokyo') }], []);
    await signIn(service, []);
    expect(service.cachedZone(7)).toBeNull();
    await service.onReaderUpdated({ reader: { id: 7, resources: [{ id: 1 }] } } as never);
    expect(service.cachedZone(7)).toBe('Asia/Tokyo');
    // A process zone that already has Tokyo's offset (+540) needs no push.
    const processIsTokyo = -new Date().getTimezoneOffset() === 540;
    expect(sent.map((data) => JSON.parse(data))).toEqual(
      processIsTokyo ? [] : [{ event: 'HEARTBEAT', serverTime: expect.objectContaining({ utcOffsetMinutes: 540 }) }],
    );
    expect(listResends(events)).toEqual([7]);
  });

  it('skips reader updates of readers that are not connected', async () => {
    const getTimeZone = jest.fn(() => 'Asia/Tokyo');
    const { service, websocket } = setup([{ plugin: 'a', provider: { getSlotContributions: () => [], getTimeZone } }]);
    websocket.sockets.clear();
    await service.onReaderUpdated({ reader: { id: 7, resources: [{ id: 1 }] } } as never);
    expect(getTimeZone).not.toHaveBeenCalled();
    expect(service.cachedZone(7)).toBeNull();
  });

  it('reruns a coalesced refresh with resource ids that changed while it ran', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    let release: (value: string) => void = () => undefined;
    const gate = new Promise<string>((resolve) => (release = resolve));
    const asked: number[] = [];
    const { service } = setup([
      {
        plugin: 'a',
        provider: {
          getSlotContributions: () => [],
          getTimeZone: ({ resourceId }) => {
            asked.push(resourceId);
            return resourceId === 1 ? gate : 'Asia/Tokyo';
          },
        },
      },
    ]);
    const invalidated = service.onInvalidate({ pluginName: 'a', scope: { readerId: 7 } });
    await settle();
    expect(asked).toEqual([1]);
    // An admin moves the reader to resource 2 while resource 1 is still being asked.
    const updated = service.onReaderUpdated({ reader: { id: 7, resources: [{ id: 2 }] } } as never);
    release('Europe/Berlin');
    await Promise.all([invalidated, updated]);
    expect(asked).toEqual([1, 2]);
    expect(service.cachedZone(7)).toBe('Asia/Tokyo');
  });

  it('ignores resource ids a sign-in read before a reader update that came in meanwhile', async () => {
    const byResource: Provider = {
      getSlotContributions: () => [],
      getTimeZone: ({ resourceId }) => (resourceId === 1 ? 'Europe/Berlin' : 'Asia/Tokyo'),
    };
    const { service } = setup([{ plugin: 'a', provider: byResource }]);
    // Sign-in reads the generation, then looks the reader up: resources [1].
    const generation = service.resourceGeneration(7);
    // An admin reassigns the reader to resource 2 before the sign-in resolves.
    await service.onReaderUpdated({ reader: { id: 7, resources: [{ id: 2 }] } } as never);
    await expect(service.resolve(7, [1], generation)).resolves.toBe('Asia/Tokyo');
    // The update's ids stay: an invalidation for resource 2 still reaches the reader.
    await service.onInvalidate({ pluginName: 'a', scope: { resourceId: 2 } });
    expect(service.cachedZone(7)).toBe('Asia/Tokyo');
    // A sign-in snapshot without an update in between is used.
    await expect(service.resolve(7, [1], service.resourceGeneration(7))).resolves.toBe('Europe/Berlin');
  });

  it('looks the resources up again when a disconnected reader was updated after its sign-in lookup', async () => {
    const { service, attractap, websocket } = setup([
      {
        plugin: 'a',
        provider: {
          getSlotContributions: () => [],
          getTimeZone: ({ resourceId }) => (resourceId === 1 ? 'Europe/Berlin' : 'Asia/Tokyo'),
        },
      },
    ]);
    websocket.sockets.clear();
    const generation = service.resourceGeneration(7);
    await service.onReaderUpdated({ reader: { id: 7, resources: [{ id: 2 }] } } as never);
    attractap.findReaderById.mockResolvedValue({ id: 7, resources: [{ id: 2 }] });
    await expect(service.resolve(7, [1], generation)).resolves.toBe('Asia/Tokyo');
  });

  describe('a reconnect', () => {
    function reconnect() {
      let release: (value: string) => void = () => undefined;
      const gate = new Promise<string>((resolve) => (release = resolve));
      const env = setup([{ plugin: 'a', provider: dynamic(() => gate) }]);
      env.websocket.sockets.clear();
      const oldSocket = { id: 'old', readerId: 7, readyState: 1, send: jest.fn(), state: {} };
      const newSocket = {
        id: 'new',
        readerId: null,
        readyState: 1,
        send: jest.fn(),
        state: { signingIn: { readerId: 7, attempt: Symbol('sign-in') } } as { signingIn?: unknown },
      };
      env.websocket.sockets.set('old', oldSocket as never);
      env.websocket.sockets.set('new', newSocket as never);
      return { ...env, release, oldSocket, newSocket };
    }

    it('keeps the zone resolve of the new connection when the old one closes meanwhile', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      const { service, websocket, release } = reconnect();
      const pending = service.resolve(7, [1]);
      // The old socket closes while the new one is still signing in.
      service.forgetUnlessInUse(7, 'old');
      websocket.sockets.delete('old');
      release('Asia/Tokyo');
      await expect(pending).resolves.toBe('Asia/Tokyo');
      expect(service.cachedZone(7)).toBe('Asia/Tokyo');
    });

    it('leaves nothing behind when the signing-in socket closed and nobody else uses the reader', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      const { service, websocket, release, newSocket } = reconnect();
      websocket.sockets.delete('old');
      const pending = service.resolve(7, [1]);
      // The signing-in socket closes too; its attempt then lets go of the reader.
      websocket.sockets.delete('new');
      delete newSocket.state.signingIn;
      release('Asia/Tokyo');
      await pending;
      service.forgetUnlessInUse(7);
      const internals = service as unknown as Record<string, Map<number, unknown>>;
      for (const map of ['zones', 'sentOffsets', 'latestResolve', 'resourceIds', 'retries']) {
        expect([map, internals[map].size]).toEqual([map, 0]);
      }
    });

    it('lets an invalidation reach a reader that is still signing in', async () => {
      const { service, websocket } = setup([{ plugin: 'a', provider: zone('Asia/Tokyo') }]);
      websocket.sockets.clear();
      websocket.sockets.set('new', {
        id: 'new',
        readerId: null,
        readyState: 1,
        send: jest.fn(),
        state: { signingIn: { readerId: 7, attempt: Symbol('sign-in') } },
      } as never);
      await service.onInvalidate({ pluginName: 'a', scope: { readerId: 7 } });
      expect(service.cachedZone(7)).toBe('Asia/Tokyo');
    });
  });

  it('retries a resolve that timed out on a later heartbeat, once at a time', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    let answer: Promise<string | undefined> = new Promise(() => undefined);
    const getTimeZone = jest.fn(() => answer);
    const { service, sent, events } = setup([
      { plugin: 'a', provider: { getSlotContributions: () => [], getTimeZone } },
    ]);
    // Sign-in right after an API restart: the plugin is not ready yet.
    const pending = signIn(service, [1]);
    await jest.advanceTimersByTimeAsync(1600);
    await pending;
    expect(service.cachedZone(7)).toBeNull();

    // The first retry waits 5 s; a heartbeat meanwhile asks nobody.
    service.onHeartbeat(7);
    await jest.advanceTimersByTimeAsync(0);
    expect(getTimeZone).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(TIME_ZONE_RETRY_MIN_MS);
    // Still not ready; a second heartbeat while the retry runs starts no second ask.
    service.onHeartbeat(7);
    await jest.advanceTimersByTimeAsync(0);
    service.onHeartbeat(7);
    await jest.advanceTimersByTimeAsync(0);
    expect(getTimeZone).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1600);

    // The next retry waits twice as long.
    answer = Promise.resolve('Asia/Tokyo');
    service.onHeartbeat(7);
    await jest.advanceTimersByTimeAsync(0);
    expect(getTimeZone).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(2 * TIME_ZONE_RETRY_MIN_MS);
    service.onHeartbeat(7);
    await jest.advanceTimersByTimeAsync(0);
    expect(getTimeZone).toHaveBeenCalledTimes(3);
    expect(service.cachedZone(7)).toBe('Asia/Tokyo');
    expect(JSON.parse(sent[sent.length - 1])).toMatchObject({ serverTime: { utcOffsetMinutes: 540 } });
    expect(listResends(events)).toEqual([7]);

    // Resolved: later heartbeats ask nobody.
    await jest.advanceTimersByTimeAsync(TIME_ZONE_RETRY_MAX_MS);
    service.onHeartbeat(7);
    await jest.advanceTimersByTimeAsync(0);
    expect(getTimeZone).toHaveBeenCalledTimes(3);
  });

  it('backs off up to 5 minutes for a plugin that never answers, and warns once per streak', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    let answer: Promise<string | undefined> = new Promise(() => undefined);
    const askedAt: number[] = [];
    const { service } = setup([
      {
        plugin: 'a',
        provider: {
          getSlotContributions: () => [],
          getTimeZone: () => {
            askedAt.push(Date.now());
            return answer;
          },
        },
      },
    ]);
    const warn = jest.spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn');
    const timeoutWarnings = () => warn.mock.calls.filter(([message]) => String(message).includes('timed out')).length;
    void service.resolve(7, [1]);
    // A reader heartbeat every 5 s for 25 minutes.
    for (let second = 0; second < 25 * 60; second += 5) {
      await jest.advanceTimersByTimeAsync(5000);
      service.onHeartbeat(7);
    }
    const gaps = askedAt.slice(1).map((at, i) => at - askedAt[i]);
    // 300 heartbeats, but only a handful of asks: the gaps grow and stop growing at the maximum.
    expect(askedAt.length).toBeLessThan(15);
    gaps.slice(1).forEach((gap, i) => expect(gap).toBeGreaterThanOrEqual(gaps[i]));
    const capped = gaps.slice(-2);
    for (const gap of capped) expect(gap).toBeGreaterThanOrEqual(TIME_ZONE_RETRY_MAX_MS);
    for (const gap of capped) expect(gap).toBeLessThanOrEqual(TIME_ZONE_RETRY_MAX_MS + 1500 + 5000);
    expect(timeoutWarnings()).toBe(1);

    // An answer ends the streak; the next timeout is reported again.
    answer = Promise.resolve('Asia/Tokyo');
    await jest.advanceTimersByTimeAsync(TIME_ZONE_RETRY_MAX_MS);
    service.onHeartbeat(7);
    await jest.advanceTimersByTimeAsync(0);
    expect(service.cachedZone(7)).toBe('Asia/Tokyo');
    answer = new Promise(() => undefined);
    void service.resolve(7);
    await jest.advanceTimersByTimeAsync(1600);
    expect(timeoutWarnings()).toBe(2);
  });

  it('does not touch readers outside the invalidated scope', async () => {
    const { service, sent } = setup([{ plugin: 'a', provider: zone('Asia/Tokyo') }], [1]);
    await service.onInvalidate({ pluginName: 'a', scope: { resourceId: 99 } });
    await service.onInvalidate({ pluginName: 'a', scope: { readerId: 8 } });
    expect(sent).toHaveLength(0);
  });

  it('follows DST across heartbeats', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-03-29T00:59:00Z'));
    const { service } = setup([{ plugin: 'a', provider: zone('Europe/Berlin') }]);
    await service.resolve(7);
    expect(service.serverTimeFor(7).utcOffsetMinutes).toBe(60);
    jest.setSystemTime(new Date('2026-03-29T01:01:00Z'));
    expect(service.serverTimeFor(7).utcOffsetMinutes).toBe(120);
  });

  it('follows DST back in autumn', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-10-25T00:59:00Z'));
    const { service } = setup([{ plugin: 'a', provider: zone('Europe/Berlin') }]);
    await service.resolve(7);
    expect(service.serverTimeFor(7).utcOffsetMinutes).toBe(120);
    jest.setSystemTime(new Date('2026-10-25T01:00:00Z'));
    expect(service.serverTimeFor(7).utcOffsetMinutes).toBe(60);
  });
});
