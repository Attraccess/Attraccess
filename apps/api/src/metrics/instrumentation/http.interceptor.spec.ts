// Unit tests for HttpMetricsInterceptor recording duration + count per HTTP request
// FEATURE: Metrics — HTTP timing instrumentation
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { HttpMetricsInterceptor } from './http.interceptor';
import { HttpMetrics } from '../definitions/http.metrics';
import { MetricsToggleService } from '../settings/metrics-toggle.service';

describe('HttpMetricsInterceptor', () => {
  let interceptor: HttpMetricsInterceptor;
  let metrics: { duration: { observe: jest.Mock }; total: { inc: jest.Mock } };
  let toggle: { isEnabledCached: jest.Mock };

  beforeEach(() => {
    metrics = {
      duration: { observe: jest.fn() },
      total: { inc: jest.fn() },
    };
    toggle = { isEnabledCached: jest.fn().mockReturnValue(true) };
    interceptor = new HttpMetricsInterceptor(
      metrics as unknown as HttpMetrics,
      toggle as unknown as MetricsToggleService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createHttpContext(
    method = 'GET',
    path = '/api/test',
    statusCode = 200,
  ): { context: ExecutionContext; next: CallHandler } {
    const request = { method, path, route: { path } };
    const response = { statusCode };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const next = { handle: () => of(null) } as CallHandler;
    return { context, next };
  }

  it('records duration and count on successful requests', (done) => {
    const { context, next } = createHttpContext('GET', '/api/test', 200);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(metrics.duration.observe).toHaveBeenCalledWith(
          expect.objectContaining({ method: 'GET', route: '/api/test', status_code: '200' }),
          expect.any(Number),
        );
        expect(metrics.total.inc).toHaveBeenCalledWith(
          expect.objectContaining({ method: 'GET', route: '/api/test', status_code: '200' }),
        );
        done();
      },
    });
  });

  it('records error status code on failed requests', (done) => {
    const { context } = createHttpContext('POST', '/api/create');
    const errorNext = {
      handle: () => throwError(() => ({ status: 422, message: 'Validation error' })),
    } as unknown as CallHandler;

    interceptor.intercept(context, errorNext).subscribe({
      error: () => {
        expect(metrics.duration.observe).toHaveBeenCalledWith(
          expect.objectContaining({ status_code: '422' }),
          expect.any(Number),
        );
        done();
      },
    });
  });

  it('defaults to 500 when error has no status', (done) => {
    const { context } = createHttpContext('GET', '/api/fail');
    const errorNext = {
      handle: () => throwError(() => ({ message: 'Internal error' })),
    } as unknown as CallHandler;

    interceptor.intercept(context, errorNext).subscribe({
      error: () => {
        expect(metrics.duration.observe).toHaveBeenCalledWith(
          expect.objectContaining({ status_code: '500' }),
          expect.any(Number),
        );
        done();
      },
    });
  });

  it('skips non-http contexts', (done) => {
    const context = {
      getType: () => 'ws',
      switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
    } as unknown as ExecutionContext;
    const next = { handle: () => of('ws-result') } as CallHandler;

    interceptor.intercept(context, next).subscribe({
      next: (value) => {
        expect(value).toBe('ws-result');
        expect(metrics.duration.observe).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('measures duration in seconds (not milliseconds)', (done) => {
    const { context, next } = createHttpContext();

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        const duration = metrics.duration.observe.mock.calls[0][1];
        expect(duration).toBeGreaterThanOrEqual(0);
        expect(duration).toBeLessThan(1);
        done();
      },
    });
  });

  it('labels unmatched routes with a constant to avoid cardinality explosion', (done) => {
    const request = { method: 'GET', path: '/foo/' + Math.random(), route: undefined };
    const response = { statusCode: 404 };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const next = { handle: () => of(null) } as CallHandler;

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(metrics.total.inc).toHaveBeenCalledWith(
          expect.objectContaining({ route: 'unmatched' }),
        );
        done();
      },
    });
  });

  it('returns the downstream observable unchanged when the http toggle is disabled', (done) => {
    toggle.isEnabledCached.mockReturnValueOnce(false);
    const { context } = createHttpContext();
    const handle = jest.fn(() => of('payload'));
    const next = { handle } as unknown as CallHandler;

    const result = interceptor.intercept(context, next);

    result.subscribe({
      next: (value) => {
        expect(value).toBe('payload');
      },
      complete: () => {
        expect(handle).toHaveBeenCalledTimes(1);
        expect(metrics.duration.observe).not.toHaveBeenCalled();
        expect(metrics.total.inc).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('reads the toggle synchronously without awaiting', () => {
    const { context, next } = createHttpContext();
    interceptor.intercept(context, next);
    expect(toggle.isEnabledCached).toHaveBeenCalledWith('http');
    expect(toggle.isEnabledCached).toHaveBeenCalledTimes(1);
  });
});
