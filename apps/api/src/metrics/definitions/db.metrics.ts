// Prometheus metric definitions for the database query subsystem
// FEATURE: Metrics — DB query duration, errors, slow queries, and pool size
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export interface DbMetrics {
  queryDuration: Histogram<'entity' | 'method'>;
  queryErrorsTotal: Counter<'entity' | 'method' | 'error_type'>;
  slowQueriesTotal: Counter<'entity' | 'method'>;
  poolSize: Gauge<string>;
}

export function createDbMetrics(registry: Registry): DbMetrics {
  return {
    queryDuration: new Histogram({
      name: 'attraccess_db_query_duration_seconds',
      help: 'Duration of database queries in seconds, labeled by entity and method',
      labelNames: ['entity', 'method'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 5],
      registers: [registry],
    }),
    queryErrorsTotal: new Counter({
      name: 'attraccess_db_query_errors_total',
      help: 'Total number of database query errors by entity, method, and error type',
      labelNames: ['entity', 'method', 'error_type'],
      registers: [registry],
    }),
    slowQueriesTotal: new Counter({
      name: 'attraccess_db_slow_queries_total',
      help: 'Total number of slow database queries (above the configured slow query threshold)',
      labelNames: ['entity', 'method'],
      registers: [registry],
    }),
    poolSize: new Gauge({
      name: 'attraccess_db_pool_size',
      help: 'Current database connection pool size',
      registers: [registry],
    }),
  };
}
