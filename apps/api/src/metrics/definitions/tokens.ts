// DI tokens for per-subsystem metric definition providers
// FEATURE: Metrics — definition modules registered with shared Prometheus registry
export const HTTP_METRICS = Symbol('HTTP_METRICS');
export const WS_METRICS = Symbol('WS_METRICS');
export const CRON_METRICS = Symbol('CRON_METRICS');
export const DB_METRICS = Symbol('DB_METRICS');
export const EXTERNAL_METRICS = Symbol('EXTERNAL_METRICS');
export const SSE_METRICS = Symbol('SSE_METRICS');
export const FLOW_METRICS = Symbol('FLOW_METRICS');
