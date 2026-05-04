// Unit tests for SseInstrumentation wrapper recording active connections, messages, and duration
// FEATURE: Metrics — Server-Sent Events instrumentation
import { Registry } from 'prom-client';
import { Subject } from 'rxjs';
import { createSseMetrics } from '../../definitions/sse.metrics';
import { MetricsToggleService } from '../../settings/metrics-toggle.service';
import { SseInstrumentation } from './sse.helper';

describe('SseInstrumentation.wrap', () => {
  function setup(enabled = true) {
    const registry = new Registry();
    const metrics = createSseMetrics(registry);
    const toggle = { isEnabledCached: jest.fn().mockReturnValue(enabled) } as unknown as MetricsToggleService;
    const instr = new SseInstrumentation(metrics, toggle);
    return { registry, metrics, toggle, instr };
  }

  afterEach(() => jest.restoreAllMocks());

  it('increments active connections gauge to 1 on subscribe', async () => {
    const { registry, instr } = setup();
    const source = new Subject<{ data: object }>();

    const wrapped = instr.wrap('resource_usage', source.asObservable());
    const sub = wrapped.subscribe();

    const text = await registry.metrics();
    expect(text).toContain('attraccess_sse_active_connections{stream="resource_usage"} 1');

    sub.unsubscribe();
  });

  it('increments messages sent counter per emission', async () => {
    const { registry, instr } = setup();
    const source = new Subject<{ data: object }>();

    const wrapped = instr.wrap('billing', source.asObservable());
    const received: Array<{ data: object }> = [];
    const sub = wrapped.subscribe((value) => received.push(value));

    source.next({ data: { a: 1 } });
    source.next({ data: { a: 2 } });
    source.next({ data: { a: 3 } });

    expect(received).toHaveLength(3);
    const text = await registry.metrics();
    expect(text).toContain('attraccess_sse_messages_sent_total{stream="billing"} 3');

    sub.unsubscribe();
  });

  it('decrements active connections and observes duration on unsubscribe', async () => {
    const { registry, instr } = setup();
    const source = new Subject<{ data: object }>();

    const wrapped = instr.wrap('resource_flows', source.asObservable());
    const sub = wrapped.subscribe();
    sub.unsubscribe();

    const text = await registry.metrics();
    expect(text).toContain('attraccess_sse_active_connections{stream="resource_flows"} 0');
    expect(text).toContain('attraccess_sse_connection_duration_seconds_count{stream="resource_flows"} 1');
  });

  it('skips recording when toggle disabled at subscribe time', async () => {
    const { registry, instr } = setup(false);
    const source = new Subject<{ data: object }>();

    const wrapped = instr.wrap('resource_usage', source.asObservable());
    const received: Array<{ data: object }> = [];
    const sub = wrapped.subscribe((value) => received.push(value));

    source.next({ data: { a: 1 } });
    sub.unsubscribe();

    expect(received).toHaveLength(1);
    const text = await registry.metrics();
    expect(text).not.toContain('attraccess_sse_active_connections{');
    expect(text).not.toContain('attraccess_sse_messages_sent_total{');
    expect(text).not.toContain('attraccess_sse_connection_duration_seconds_count{');
  });

  it('tracks gauge across multiple concurrent subscribers (3 up, 0 down)', async () => {
    const { registry, instr } = setup();
    const source = new Subject<{ data: object }>();
    const wrapped = instr.wrap('resource_usage', source.asObservable());

    const subs = [wrapped.subscribe(), wrapped.subscribe(), wrapped.subscribe()];

    let text = await registry.metrics();
    expect(text).toContain('attraccess_sse_active_connections{stream="resource_usage"} 3');

    subs.forEach((s) => s.unsubscribe());

    text = await registry.metrics();
    expect(text).toContain('attraccess_sse_active_connections{stream="resource_usage"} 0');
    expect(text).toContain('attraccess_sse_connection_duration_seconds_count{stream="resource_usage"} 3');
  });

  it('propagates errors through to subscriber', () => {
    const { instr } = setup();
    const source = new Subject<{ data: object }>();
    const wrapped = instr.wrap('billing', source.asObservable());

    const onError = jest.fn();
    const sub = wrapped.subscribe({ next: () => undefined, error: onError });

    const boom = new Error('boom');
    source.error(boom);

    expect(onError).toHaveBeenCalledWith(boom);
    sub.unsubscribe();
  });
});
