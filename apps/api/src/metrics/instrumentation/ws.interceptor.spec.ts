// Unit tests for WsMetricsInterceptor recording duration + count per WS message
// FEATURE: Metrics — WebSocket message timing instrumentation
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { Registry } from 'prom-client';
import { WsMetricsInterceptor } from './ws.interceptor';
import { createWsMetrics } from '../definitions/ws.metrics';
import { MetricsToggleService } from '../settings/metrics-toggle.service';

function buildWsContext(event: string | null = 'HEARTBEAT'): ExecutionContext {
  return {
    getType: () => 'ws',
    switchToWs: () => ({
      getPattern: () => event,
      getClient: () => ({}),
      getData: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe('WsMetricsInterceptor', () => {
  it('records success duration + count', (done) => {
    const registry = new Registry();
    const metrics = createWsMetrics(registry);
    const toggle = { isEnabledCached: jest.fn().mockReturnValue(true) } as unknown as MetricsToggleService;
    const interceptor = new WsMetricsInterceptor(metrics, toggle);
    const handler: CallHandler = { handle: () => of('ok') };

    interceptor.intercept(buildWsContext(), handler).subscribe({
      complete: async () => {
        const text = await registry.metrics();
        expect(text).toContain(
          'attraccess_ws_messages_total{gateway="attractap",event="HEARTBEAT",status="success"} 1',
        );
        expect(text).toContain('attraccess_ws_message_duration_seconds_count{gateway="attractap",event="HEARTBEAT",status="success"} 1');
        done();
      },
    });
  });

  it('records error status when handler throws', (done) => {
    const registry = new Registry();
    const metrics = createWsMetrics(registry);
    const toggle = { isEnabledCached: jest.fn().mockReturnValue(true) } as unknown as MetricsToggleService;
    const interceptor = new WsMetricsInterceptor(metrics, toggle);
    const handler: CallHandler = { handle: () => throwError(() => new Error('boom')) };

    interceptor.intercept(buildWsContext(), handler).subscribe({
      error: async () => {
        const text = await registry.metrics();
        expect(text).toContain(
          'attraccess_ws_messages_total{gateway="attractap",event="HEARTBEAT",status="error"} 1',
        );
        done();
      },
    });
  });

  it('skips when toggle is off', (done) => {
    const registry = new Registry();
    const metrics = createWsMetrics(registry);
    const toggle = { isEnabledCached: jest.fn().mockReturnValue(false) } as unknown as MetricsToggleService;
    const interceptor = new WsMetricsInterceptor(metrics, toggle);
    const handler: CallHandler = { handle: () => of('ok') };

    interceptor.intercept(buildWsContext(), handler).subscribe({
      complete: async () => {
        const text = await registry.metrics();
        expect(text).not.toContain('attraccess_ws_messages_total{');
        expect(text).not.toContain('attraccess_ws_message_duration_seconds_count{');
        done();
      },
    });
  });

  it('passes through non-ws contexts unchanged without consulting the toggle', (done) => {
    const registry = new Registry();
    const metrics = createWsMetrics(registry);
    const toggle = { isEnabledCached: jest.fn().mockReturnValue(true) } as unknown as MetricsToggleService;
    const interceptor = new WsMetricsInterceptor(metrics, toggle);
    const handler: CallHandler = { handle: () => of('http-result') };
    const httpCtx = { getType: () => 'http' } as unknown as ExecutionContext;

    interceptor.intercept(httpCtx, handler).subscribe({
      next: (value) => {
        expect(value).toBe('http-result');
      },
      complete: () => {
        expect(toggle.isEnabledCached).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('labels missing event patterns as "unknown"', (done) => {
    const registry = new Registry();
    const metrics = createWsMetrics(registry);
    const toggle = { isEnabledCached: jest.fn().mockReturnValue(true) } as unknown as MetricsToggleService;
    const interceptor = new WsMetricsInterceptor(metrics, toggle);
    const handler: CallHandler = { handle: () => of('ok') };

    interceptor.intercept(buildWsContext(null), handler).subscribe({
      complete: async () => {
        const text = await registry.metrics();
        expect(text).toContain(
          'attraccess_ws_messages_total{gateway="attractap",event="unknown",status="success"} 1',
        );
        done();
      },
    });
  });
});
