// Prometheus metric definitions for encrypted Attractap reader sessions
// FEATURE: Metrics — open sessions, handshake queue depth and failed handshakes by reason
import { Counter, Gauge, Registry } from 'prom-client';

export interface AttractapSessionMetrics {
  activeSessions: Gauge;
  handshakeQueueDepth: Gauge;
  handshakeFailures: Counter<'reason'>;
}

/** `queueDepth` is read at scrape time; the handshake limiter owns the value. */
export function createAttractapSessionMetrics(registry: Registry, queueDepth: () => number): AttractapSessionMetrics {
  return {
    activeSessions: new Gauge({
      name: 'attraccess_attractap_sessions_active',
      help: 'Number of open encrypted reader sessions',
      registers: [registry],
    }),
    handshakeQueueDepth: new Gauge({
      name: 'attraccess_attractap_handshake_queue_depth',
      help: 'Reader TLS handshakes waiting for a free slot',
      registers: [registry],
      collect() {
        this.set(queueDepth());
      },
    }),
    handshakeFailures: new Counter({
      name: 'attraccess_attractap_handshake_failures_total',
      help: 'Failed reader session handshakes by reason',
      labelNames: ['reason'],
      registers: [registry],
    }),
  };
}
