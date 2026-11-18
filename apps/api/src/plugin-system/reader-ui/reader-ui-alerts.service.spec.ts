import { ReaderUiAlertsService } from './reader-ui-alerts.service';
import { InMemoryReaderUiAlertStore } from './reader-ui-stores.test-fixture';

function setup() {
  const store = new InMemoryReaderUiAlertStore();
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const gauge = { set: jest.fn() };
  const service = new ReaderUiAlertsService(store, audit as never, { readerUiOpenAlerts: gauge } as never);
  return { service, rows: store.rows, audit, gauge };
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
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'attractap',
        action: 'attractap.ui.alert_changed',
        details: { kind: 'breaker-open', state: 'created', plugin: 'p' },
      }),
    );
    expect(gauge.set).toHaveBeenCalledWith({ kind: 'time-zone-conflict' }, 0);
    expect(gauge.set).toHaveBeenCalledWith({ kind: 'breaker-open' }, 1);
  });

  it('suspends a crash-looping reader until cleared by an admin', async () => {
    const { service } = setup();
    const alert = await service.raise('crash-loop', 'PANIC', { readerId: 5 });
    expect(service.isReaderSuspended(5)).toBe(true);
    await service.clear(alert.id, { id: 1 });
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
    await service.clear(alert.id, { id: 1 });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ kind: 'breaker-open', plugin: 'p' }));
    await expect(service.clear(alert.id, { id: 1 })).resolves.toBeNull();
  });

  it('keeps the original crash-loop deadline across a restart and drops an alert that already lapsed', async () => {
    const { service, rows } = setup();
    const now = Date.now();
    const seed = { plugin: null, clearedAt: null, clearedByUserId: null, message: 'PANIC' } as const;
    rows.push(
      { ...seed, id: 1, kind: 'crash-loop', readerId: 5, createdAt: new Date(now - 20 * 60_000) },
      { ...seed, id: 2, kind: 'crash-loop', readerId: 6, createdAt: new Date(now - 40 * 60_000) },
    );
    await service.onModuleInit();
    expect(service.isReaderSuspended(5)).toBe(true);
    expect(service.isReaderSuspended(6)).toBe(false);
    expect(rows[1].clearedAt).not.toBeNull();
    jest.advanceTimersByTime(11 * 60_000);
    expect(service.isReaderSuspended(5)).toBe(false);
  });
});
