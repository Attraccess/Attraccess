/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReaderUiAlertsService } from './reader-ui-alerts.service';

function setup() {
  const rows: any[] = [];
  const repository = {
    find: jest.fn(async ({ where }: any) =>
      rows.filter((r) =>
        Object.entries(where).every(([k, v]: any) => (v?._type === 'isNull' ? r[k] == null : r[k] === v)),
      ),
    ),
    findOne: jest.fn(
      async ({ where }: any) =>
        rows.find((r) =>
          Object.entries(where).every(([k, v]: any) => (v?._type === 'isNull' ? r[k] == null : r[k] === v)),
        ) ?? null,
    ),
    create: (x: any) => ({ clearedAt: null, clearedByUserId: null, plugin: null, readerId: null, ...x }),
    save: jest.fn(async (x: any) => {
      if (!x.id) {
        x.id = rows.length + 1;
        rows.push(x);
      }
      return x;
    }),
  };
  const audit = { recordAttractap: jest.fn().mockResolvedValue(undefined) };
  const gauge = { set: jest.fn() };
  const service = new ReaderUiAlertsService(
    repository as never,
    audit as never,
    { readerUiOpenAlerts: gauge } as never,
  );
  return { service, rows, audit, gauge };
}

describe('ReaderUiAlertsService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('raises one alert per scope, audits it and exposes it as a gauge', async () => {
    const { service, rows, audit, gauge } = setup();
    const a = await service.raise('breaker-open', 'down', { plugin: 'p' });
    const b = await service.raise('breaker-open', 'down again', { plugin: 'p' });
    expect(b.id).toBe(a.id);
    expect(rows).toHaveLength(1);
    expect(audit.recordAttractap).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ui.alert_changed',
        details: { kind: 'breaker-open', state: 'created', plugin: 'p' },
      }),
    );
    expect(gauge.set).toHaveBeenLastCalledWith({ kind: 'crash-loop' }, 0);
    expect(gauge.set).toHaveBeenCalledWith({ kind: 'breaker-open' }, 1);
  });

  it('suspends a crash-looping reader until cleared by an admin', async () => {
    const { service } = setup();
    const alert = await service.raise('crash-loop', 'PANIC', { readerId: 5 });
    expect(service.isReaderSuspended(5)).toBe(true);
    await service.clear(alert.id, 1);
    expect(service.isReaderSuspended(5)).toBe(false);
  });

  it('lifts the suspension after 30 minutes without another panic, and another panic restarts the window', async () => {
    const { service } = setup();
    await service.raise('crash-loop', 'PANIC', { readerId: 5 });
    jest.advanceTimersByTime(20 * 60_000);
    service.touchCrash(5);
    jest.advanceTimersByTime(20 * 60_000);
    expect(service.isReaderSuspended(5)).toBe(true);
    jest.advanceTimersByTime(11 * 60_000);
    expect(service.isReaderSuspended(5)).toBe(false);
  });

  it('notifies listeners (breaker reset) when an alert is cleared', async () => {
    const { service } = setup();
    const listener = jest.fn();
    service.onCleared(listener);
    const alert = await service.raise('breaker-open', 'down', { plugin: 'p' });
    await service.clear(alert.id, 1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ kind: 'breaker-open', plugin: 'p' }));
    await expect(service.clear(alert.id, 1)).resolves.toBeNull();
  });
});
