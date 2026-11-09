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
  return { service, alerts, sent, providers };
}

const zone = (value: string | undefined): Provider => ({ getSlotContributions: () => [], getTimeZone: () => value });

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

  it('keeps the first zone and raises one alert when plugins disagree', async () => {
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
});
