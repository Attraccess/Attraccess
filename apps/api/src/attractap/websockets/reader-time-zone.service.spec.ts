import type { ReaderUiProvider } from '@attraccess/plugins-backend-sdk';
import { ReaderTimeZoneService } from './reader-time-zone.service';

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
  const service = new ReaderTimeZoneService(registry as never, alerts as never, attractap as never, websocket as never);
  return { service, alerts, sent, providers, attractap };
}

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
      { plugin: 'c', provider: zone('Europe/Berlin') },
    ]);
    await expect(service.resolve(7)).resolves.toBe('Europe/Berlin');
    expect(service.cachedZone(7)).toBe('Europe/Berlin');
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
    await expect(service.resolvedServerTimeFor(7, new Date('2026-07-15T12:00:00Z'))).resolves.toMatchObject({
      utcOffsetMinutes: 120,
    });
  });

  it('never throws: without a cached zone the process zone applies', async () => {
    const { service, attractap } = setup([{ plugin: 'a', provider: zone('Europe/Berlin') }]);
    attractap.findReaderById.mockRejectedValue(new Error('db down'));
    const at = new Date('2026-07-15T12:00:00Z');
    await expect(service.resolvedServerTimeFor(7, at)).resolves.toMatchObject({
      utcOffsetMinutes: -at.getTimezoneOffset() || 0,
    });
  });

  it('drops a slow older answer when a newer resolve finished first', async () => {
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
    await service.resolvedServerTimeFor(7);
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

  it('sends the zone offset in serverTime: +60 in winter and +120 in summer for Europe/Berlin', async () => {
    const { service } = setup([{ plugin: 'a', provider: zone('Europe/Berlin') }]);
    const winter = await service.resolvedServerTimeFor(7, new Date('2026-01-15T12:00:00Z'));
    expect(winter.utcOffsetMinutes).toBe(60);
    const summer = service.serverTimeFor(7, new Date('2026-07-15T12:00:00Z'));
    expect(summer.utcOffsetMinutes).toBe(120);
    expect(service.readerUtcOffsetMinutes(7, new Date('2026-07-15T12:00:00Z'))).toBe(120);
  });

  it('pushes a changed offset to the reader at once, and only when it changed', async () => {
    let current: string | undefined = 'Europe/Berlin';
    const { service, sent } = setup([
      { plugin: 'a', provider: { getSlotContributions: () => [], getTimeZone: () => current } },
    ]);
    await service.resolvedServerTimeFor(7);
    await service.onInvalidate({ pluginName: 'a', scope: { resourceId: 1 } });
    expect(sent).toHaveLength(0);
    current = 'Asia/Tokyo';
    await service.onInvalidate({ pluginName: 'a', scope: { resourceId: 1 } });
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0])).toMatchObject({ event: 'HEARTBEAT', serverTime: { utcOffsetMinutes: 540 } });
    await service.onInvalidate({ pluginName: 'a', scope: { readerId: 7 } });
    expect(sent).toHaveLength(1);
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
