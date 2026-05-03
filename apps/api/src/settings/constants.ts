export const APP_PARENT = 'app';
export const SMTP_PARENT = 'smtp';

export const APP_KEYS = {
  url: 'backend_url',
  publicInternetUrl: 'public_internet_url',
  licenseKey: 'license_key',
} as const;

export const METRICS_PARENT = 'metrics';

export const METRICS_KEYS = {
  apiKey: 'api_key',
} as const;

export const METRICS_TOGGLE_KEYS = {
  http: 'metrics_http_enabled',
  ws: 'metrics_ws_enabled',
  cron: 'metrics_cron_enabled',
  db: 'metrics_db_enabled',
  external: 'metrics_external_enabled',
  sse: 'metrics_sse_enabled',
  flow: 'metrics_flow_enabled',
} as const;

export type MetricsSubsystem = keyof typeof METRICS_TOGGLE_KEYS;

export const SMTP_KEYS = {
  service: 'service',
  host: 'host',
  port: 'port',
  secure: 'secure',
  user: 'user',
  pass: 'pass',
  from: 'from',
} as const;

/** Cache TTL for settings reads. Writes update cache immediately; this only affects reads when DB is changed outside this process. */
export const SETTINGS_CACHE_TTL_MS = 60 * 1000; // 1 minute
