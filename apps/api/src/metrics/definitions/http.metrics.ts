// Prometheus metric definitions for the HTTP subsystem
// FEATURE: Metrics — HTTP request duration + request count
import { Counter, Histogram, Registry } from 'prom-client';

export interface HttpMetrics {
  duration: Histogram<'method' | 'route' | 'status_code' | 'auth_method'>;
  total: Counter<'method' | 'route' | 'status_code' | 'auth_method'>;
}

export function createHttpMetrics(registry: Registry): HttpMetrics {
  return {
    duration: new Histogram({
      name: 'attraccess_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code', 'auth_method'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    }),
    total: new Counter({
      name: 'attraccess_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code', 'auth_method'],
      registers: [registry],
    }),
  };
}
