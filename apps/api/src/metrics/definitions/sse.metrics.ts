// Prometheus metric definitions for the Server-Sent Events subsystem
// FEATURE: Metrics — SSE active connections, lifetime histogram, and message counter
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export interface SseMetrics {
  activeConnections: Gauge<'stream'>;
  connectionDuration: Histogram<'stream'>;
  messagesSentTotal: Counter<'stream'>;
}

export function createSseMetrics(registry: Registry): SseMetrics {
  return {
    activeConnections: new Gauge({
      name: 'attraccess_sse_active_connections',
      help: 'Number of active SSE connections per stream',
      labelNames: ['stream'],
      registers: [registry],
    }),
    connectionDuration: new Histogram({
      name: 'attraccess_sse_connection_duration_seconds',
      help: 'Lifetime of SSE connections in seconds (recorded on disconnect)',
      labelNames: ['stream'],
      buckets: [10, 60, 300, 900, 3600, 21600, 86400],
      registers: [registry],
    }),
    messagesSentTotal: new Counter({
      name: 'attraccess_sse_messages_sent_total',
      help: 'Total number of SSE messages sent per stream',
      labelNames: ['stream'],
      registers: [registry],
    }),
  };
}
