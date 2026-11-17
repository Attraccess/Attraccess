// Prometheus metric definitions for the plugin BLE transport (context.ble through Attractap readers)
// FEATURE: Metrics — BLE operations, sessions, rejections and notifications. Labels stay low-cardinality:
// reader, endpoint and session ids appear only in logs.
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export interface PluginBleMetrics {
  operations: Counter<'operation' | 'outcome'>;
  operationDuration: Histogram<'operation'>;
  sessionsActive: Gauge;
  sessionCloses: Counter<'reason'>;
  rejections: Counter<'code'>;
  notifications: Counter<'outcome'>;
  watchesActive: Gauge;
  watchEventsReceived: Counter;
  watchEventsRouted: Counter;
  watchEventsDropped: Counter<'reason'>;
}

/** Why an advertisement watch event did not reach a plugin. */
export type PluginBleWatchDropReason =
  | 'malformed'
  | 'batch-too-large'
  | 'rate-limit'
  | 'stale-connection'
  | 'access-denied'
  | 'no-watch'
  | 'filter-mismatch'
  | 'queue-full';

export type PluginBleNotificationOutcome = 'delivered' | 'overflow' | 'oversized' | 'malformed';

/** How a failed notification stream is counted: by its error code, whichever side failed it. */
export function bleStreamOutcome(errorCode: string): Exclude<PluginBleNotificationOutcome, 'delivered'> {
  if (errorCode === 'NOTIFICATION_OVERFLOW') return 'overflow';
  return errorCode === 'PAYLOAD_TOO_LARGE' ? 'oversized' : 'malformed';
}

export function createPluginBleMetrics(registry: Registry): PluginBleMetrics {
  return {
    operations: new Counter({
      name: 'attraccess_plugin_ble_operations_total',
      help: 'Plugin BLE operations by operation and outcome (ok or the error code)',
      labelNames: ['operation', 'outcome'],
      registers: [registry],
    }),
    operationDuration: new Histogram({
      name: 'attraccess_plugin_ble_operation_duration_seconds',
      help: 'Duration of successful plugin BLE operations, including the reader round trip',
      labelNames: ['operation'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
      registers: [registry],
    }),
    sessionsActive: new Gauge({
      name: 'attraccess_plugin_ble_sessions_active',
      help: 'Open plugin BLE sessions',
      registers: [registry],
    }),
    sessionCloses: new Counter({
      name: 'attraccess_plugin_ble_session_closes_total',
      help: 'Closed plugin BLE sessions by close reason',
      labelNames: ['reason'],
      registers: [registry],
    }),
    rejections: new Counter({
      name: 'attraccess_plugin_ble_rejections_total',
      help: 'Plugin BLE calls refused by profile, allowlist or payload bounds (API or reader firmware), by code',
      labelNames: ['code'],
      registers: [registry],
    }),
    notifications: new Counter({
      name: 'attraccess_plugin_ble_notifications_total',
      help: 'Plugin BLE notifications by outcome: delivered, overflow, oversized or malformed',
      labelNames: ['outcome'],
      registers: [registry],
    }),
    watchesActive: new Gauge({
      name: 'attraccess_plugin_ble_watches_active',
      help: 'Open plugin BLE advertisement watches',
      registers: [registry],
    }),
    watchEventsReceived: new Counter({
      name: 'attraccess_plugin_ble_watch_events_received_total',
      help: 'Advertisement watch events the API accepted from readers',
      registers: [registry],
    }),
    watchEventsRouted: new Counter({
      name: 'attraccess_plugin_ble_watch_events_routed_total',
      help: 'Advertisement watch events handed to plugin watches (one event can reach several watches)',
      registers: [registry],
    }),
    watchEventsDropped: new Counter({
      name: 'attraccess_plugin_ble_watch_events_dropped_total',
      help: 'Advertisement watch events dropped by reason (malformed, limits, access, no matching watch, full queue)',
      labelNames: ['reason'],
      registers: [registry],
    }),
  };
}
