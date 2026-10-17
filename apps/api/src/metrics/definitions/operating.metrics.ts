// Prometheus metric definitions for the machine operating timeline (ATT-1024)
// FEATURE: Metrics — operating-signal transitions, current state, and data-quality failures
import { Counter, Gauge, Registry } from 'prom-client';

export interface OperatingMetricsDefinitions {
  transitionsTotal: Counter<'state' | 'result'>;
  resourceState: Gauge<'resource_id'>;
  dataQualityFailuresTotal: Counter<'kind'>;
}

export function createOperatingMetrics(registry: Registry): OperatingMetricsDefinitions {
  return {
    transitionsTotal: new Counter({
      name: 'attraccess_operating_transitions_total',
      help: 'Total number of operating-signal transitions by target state and result (applied or noop)',
      labelNames: ['state', 'result'],
      registers: [registry],
    }),
    resourceState: new Gauge({
      name: 'attraccess_operating_resource_state',
      help: 'Current operating state per resource (1 = operating, 0 = idle)',
      labelNames: ['resource_id'],
      registers: [registry],
    }),
    dataQualityFailuresTotal: new Counter({
      name: 'attraccess_operating_data_quality_failures_total',
      help: 'Total number of operating-timeline data-quality failures found by diagnostics, by kind',
      labelNames: ['kind'],
      registers: [registry],
    }),
  };
}
