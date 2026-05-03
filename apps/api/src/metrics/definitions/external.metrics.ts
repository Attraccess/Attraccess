// Prometheus metric definitions for outbound external call instrumentation
// FEATURE: Metrics — external call duration and error counters per target+operation
import { Counter, Histogram, Registry } from 'prom-client';

export interface ExternalMetrics {
  callDuration: Histogram<'target' | 'operation' | 'status'>;
  callErrorsTotal: Counter<'target' | 'operation' | 'error_type'>;
}

export function createExternalMetrics(registry: Registry): ExternalMetrics {
  return {
    callDuration: new Histogram({
      name: 'attraccess_external_call_duration_seconds',
      help: 'Duration of outbound external calls in seconds (sumup, smtp, mqtt, github, ...)',
      labelNames: ['target', 'operation', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
      registers: [registry],
    }),
    callErrorsTotal: new Counter({
      name: 'attraccess_external_call_errors_total',
      help: 'Total number of outbound external call errors by target, operation, and error type',
      labelNames: ['target', 'operation', 'error_type'],
      registers: [registry],
    }),
  };
}
