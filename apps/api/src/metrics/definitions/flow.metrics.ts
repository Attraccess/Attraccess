// Prometheus metric definitions for resource flow execution instrumentation
// FEATURE: Metrics — flow execution and per-node duration plus counters
import { Counter, Histogram, Registry } from 'prom-client';

export interface FlowMetrics {
  executionDuration: Histogram<'trigger_type' | 'status'>;
  nodeDuration: Histogram<'node_type' | 'status'>;
  executionsTotal: Counter<'trigger_type' | 'status'>;
}

export function createFlowMetrics(registry: Registry): FlowMetrics {
  return {
    executionDuration: new Histogram({
      name: 'attraccess_flow_execution_duration_seconds',
      help: 'Duration of resource flow executions in seconds, labeled by trigger type and status',
      labelNames: ['trigger_type', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 5, 15, 30, 60],
      registers: [registry],
    }),
    nodeDuration: new Histogram({
      name: 'attraccess_flow_node_duration_seconds',
      help: 'Duration of individual flow node executions in seconds, labeled by node type and status',
      labelNames: ['node_type', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 5, 15, 30, 60],
      registers: [registry],
    }),
    executionsTotal: new Counter({
      name: 'attraccess_flow_executions_total',
      help: 'Total number of resource flow executions by trigger type and status',
      labelNames: ['trigger_type', 'status'],
      registers: [registry],
    }),
  };
}
