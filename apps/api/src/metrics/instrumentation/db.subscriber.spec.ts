// Unit tests for DbMetricsSubscriber recording entity query timings and slow query counts
// FEATURE: Metrics — database query timing instrumentation
import { Registry } from 'prom-client';
import { DataSource } from 'typeorm';
import { createDbMetrics } from '../definitions/db.metrics';
import { MetricsToggleService } from '../settings/metrics-toggle.service';
import { DbMetricsSubscriber } from './db.subscriber';

type EventLike = { metadata: { tableName: string } };

describe('DbMetricsSubscriber', () => {
  function setup(enabled = true) {
    const registry = new Registry();
    const metrics = createDbMetrics(registry);
    const toggle = { isEnabledCached: jest.fn().mockReturnValue(enabled) } as unknown as MetricsToggleService;
    const dataSource = { subscribers: [] as unknown[] } as unknown as DataSource;
    const subscriber = new DbMetricsSubscriber(metrics, toggle, dataSource);
    return { registry, metrics, toggle, dataSource, subscriber };
  }

  function makeEvent(tableName: string | undefined = 'user'): EventLike {
    return { metadata: { tableName } } as EventLike;
  }

  async function delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  it('registers itself with the DataSource on module init', () => {
    const { subscriber, dataSource } = setup();

    subscriber.onModuleInit();

    expect(dataSource.subscribers).toContain(subscriber);
  });

  it('does not register itself twice', () => {
    const { subscriber, dataSource } = setup();

    subscriber.onModuleInit();
    subscriber.onModuleInit();

    expect(dataSource.subscribers.filter((s) => s === subscriber)).toHaveLength(1);
  });

  it('records insert duration with entity and method labels', async () => {
    const { registry, subscriber } = setup();
    const event = makeEvent('user');

    subscriber.beforeInsert(event as never);
    await delay(5);
    subscriber.afterInsert(event as never);

    const text = await registry.metrics();
    expect(text).toContain('attraccess_db_query_duration_seconds_count{entity="user",method="insert"} 1');
  });

  it('records update duration with method="update"', async () => {
    const { registry, subscriber } = setup();
    const event = makeEvent('resource');

    subscriber.beforeUpdate(event as never);
    await delay(2);
    subscriber.afterUpdate(event as never);

    const text = await registry.metrics();
    expect(text).toContain('attraccess_db_query_duration_seconds_count{entity="resource",method="update"} 1');
  });

  it('records remove duration with method="remove"', async () => {
    const { registry, subscriber } = setup();
    const event = makeEvent('session');

    subscriber.beforeRemove(event as never);
    await delay(2);
    subscriber.afterRemove(event as never);

    const text = await registry.metrics();
    expect(text).toContain('attraccess_db_query_duration_seconds_count{entity="session",method="remove"} 1');
  });

  it('records softRemove duration with method="softRemove"', async () => {
    const { registry, subscriber } = setup();
    const event = makeEvent('project');

    subscriber.beforeSoftRemove(event as never);
    await delay(2);
    subscriber.afterSoftRemove(event as never);

    const text = await registry.metrics();
    expect(text).toContain('attraccess_db_query_duration_seconds_count{entity="project",method="softRemove"} 1');
  });

  it('falls back to entity="unknown" when metadata.tableName is missing', async () => {
    const { registry, subscriber } = setup();
    const event = { metadata: {} } as EventLike;

    subscriber.beforeInsert(event as never);
    await delay(2);
    subscriber.afterInsert(event as never);

    const text = await registry.metrics();
    expect(text).toContain('attraccess_db_query_duration_seconds_count{entity="unknown",method="insert"} 1');
  });

  it('emits no series when toggle is disabled for both start and observe', async () => {
    const { registry, subscriber } = setup(false);
    const event = makeEvent('user');

    subscriber.beforeInsert(event as never);
    subscriber.afterInsert(event as never);

    const text = await registry.metrics();
    expect(text).not.toMatch(/attraccess_db_query_duration_seconds_count\{/);
    expect(text).not.toMatch(/attraccess_db_slow_queries_total\{/);
  });

  it('skips emission when toggle is enabled at start but disabled at observe', async () => {
    const { registry, metrics, subscriber, toggle } = setup(true);
    const event = makeEvent('user');
    const observeSpy = jest.spyOn(metrics.queryDuration, 'observe');

    subscriber.beforeInsert(event as never);
    (toggle.isEnabledCached as jest.Mock).mockReturnValue(false);
    subscriber.afterInsert(event as never);

    expect(observeSpy).not.toHaveBeenCalled();
    const text = await registry.metrics();
    expect(text).not.toMatch(/attraccess_db_query_duration_seconds_count\{entity="user"/);
  });

  it('increments slow queries counter when duration exceeds 0.5 seconds', () => {
    const { metrics, subscriber } = setup();
    const event = makeEvent('user');
    const original = process.hrtime.bigint.bind(process.hrtime);
    const sequence: bigint[] = [BigInt(0), BigInt(600_000_000)];
    const slowSpy = jest.spyOn(metrics.slowQueriesTotal, 'inc');
    jest.spyOn(process.hrtime, 'bigint').mockImplementation(() => sequence.shift() ?? original());

    subscriber.beforeInsert(event as never);
    subscriber.afterInsert(event as never);

    expect(slowSpy).toHaveBeenCalledWith({ entity: 'user', method: 'insert' });
  });

  it('does not increment slow queries counter for fast queries', () => {
    const { metrics, subscriber } = setup();
    const event = makeEvent('user');
    const slowSpy = jest.spyOn(metrics.slowQueriesTotal, 'inc');

    subscriber.beforeInsert(event as never);
    subscriber.afterInsert(event as never);

    expect(slowSpy).not.toHaveBeenCalled();
  });

  it('reads toggle synchronously via isEnabledCached', () => {
    const { subscriber, toggle } = setup();
    const event = makeEvent('user');

    subscriber.beforeInsert(event as never);
    subscriber.afterInsert(event as never);

    expect(toggle.isEnabledCached).toHaveBeenCalledWith('db');
  });

  it('does not emit when afterInsert fires without prior beforeInsert', async () => {
    const { registry, subscriber } = setup();
    const event = makeEvent('user');

    subscriber.afterInsert(event as never);

    const text = await registry.metrics();
    expect(text).not.toMatch(/attraccess_db_query_duration_seconds_count\{entity="user"/);
  });
});
