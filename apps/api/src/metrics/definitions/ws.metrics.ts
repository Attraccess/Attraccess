// Prometheus metric definitions for the WebSocket subsystem
// FEATURE: Metrics — WS message duration, count, and connection lifetime
import { Counter, Histogram, Registry } from 'prom-client';

export const ATTRACTAP_GATEWAY_LABEL = 'attractap';

export interface WsMetrics {
  messageDuration: Histogram<'gateway' | 'event' | 'status'>;
  messagesTotal: Counter<'gateway' | 'event' | 'status'>;
  connectionDuration: Histogram<'gateway'>;
}

export function createWsMetrics(registry: Registry): WsMetrics {
  return {
    messageDuration: new Histogram({
      name: 'attraccess_ws_message_duration_seconds',
      help: 'Duration of WebSocket message handlers in seconds',
      labelNames: ['gateway', 'event', 'status'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [registry],
    }),
    messagesTotal: new Counter({
      name: 'attraccess_ws_messages_total',
      help: 'Total number of WebSocket messages handled',
      labelNames: ['gateway', 'event', 'status'],
      registers: [registry],
    }),
    connectionDuration: new Histogram({
      name: 'attraccess_ws_connection_duration_seconds',
      help: 'Lifetime of WebSocket connections in seconds (recorded on disconnect)',
      labelNames: ['gateway'],
      buckets: [10, 60, 300, 900, 3600, 21600, 86400],
      registers: [registry],
    }),
  };
}
