import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsService } from './metrics.service';

describe('HttpMetricsInterceptor', () => {
  let interceptor: HttpMetricsInterceptor;
  let metricsService: {
    httpRequestDuration: { observe: jest.Mock };
    httpRequestsTotal: { inc: jest.Mock };
  };

  beforeEach(() => {
    metricsService = {
      httpRequestDuration: { observe: jest.fn() },
      httpRequestsTotal: { inc: jest.fn() },
    };
    interceptor = new HttpMetricsInterceptor(metricsService as unknown as MetricsService);
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
        expect(metricsService.httpRequestDuration.observe).toHaveBeenCalledWith(
          expect.objectContaining({ method: 'GET', route: '/api/test', status_code: '200' }),
          expect.any(Number),
        );
        expect(metricsService.httpRequestsTotal.inc).toHaveBeenCalledWith(
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
        expect(metricsService.httpRequestDuration.observe).toHaveBeenCalledWith(
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
        expect(metricsService.httpRequestDuration.observe).toHaveBeenCalledWith(
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
        expect(metricsService.httpRequestDuration.observe).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('measures duration in seconds (not milliseconds)', (done) => {
    const { context, next } = createHttpContext();

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        const duration = metricsService.httpRequestDuration.observe.mock.calls[0][1];
        expect(duration).toBeGreaterThanOrEqual(0);
        expect(duration).toBeLessThan(1);
        done();
      },
    });
  });
});
