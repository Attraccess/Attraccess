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
  slowQueryThresholdSeconds: 'slow_query_threshold_seconds',
} as const;

export const METRICS_SLOW_QUERY_THRESHOLD_DEFAULT_SECONDS = 0.5;

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

export const METRICS_TOGGLE_DEFAULTS: Record<MetricsSubsystem, boolean> = {
  http: true,
  ws: true,
  cron: true,
  db: false,
  external: true,
  sse: true,
  flow: true,
};

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

export const AUTH_PARENT = 'auth';

export const AUTH_KEYS = {
  rateLimitMaxAttempts: 'rate_limit_max_attempts',
  rateLimitWindowSeconds: 'rate_limit_window_seconds',
  rateLimitLockoutDurationSeconds: 'rate_limit_lockout_duration_seconds',
  rateLimitExponentialBackoff: 'rate_limit_exponential_backoff',
  rateLimitBackoffMultiplier: 'rate_limit_backoff_multiplier',
} as const;

export interface RateLimitPolicy {
  maxAttempts: number;
  windowSeconds: number;
  lockoutDurationSeconds: number;
  exponentialBackoff: boolean;
  backoffMultiplier: number;
}

export const RATE_LIMIT_DEFAULTS: RateLimitPolicy = {
  maxAttempts: 5,
  windowSeconds: 900,
  lockoutDurationSeconds: 900,
  exponentialBackoff: false,
  backoffMultiplier: 2,
};

export const MESSAGING_PARENT = 'messaging';

export const MESSAGING_KEYS = {
  sendRateLimitMax: 'send_rate_limit_max',
  sendRateLimitWindowSeconds: 'send_rate_limit_window_seconds',
  contactRateLimitMax: 'contact_rate_limit_max',
  contactRateLimitWindowSeconds: 'contact_rate_limit_window_seconds',
} as const;

export interface MessagingRateLimitPolicy {
  /** Max messages a user may send per window. */
  sendMaxPerWindow: number;
  /** Length of the send window in seconds. */
  sendWindowSeconds: number;
  /** Max conversations a user may open per window. */
  contactMaxPerWindow: number;
  /** Length of the contact window in seconds. */
  contactWindowSeconds: number;
}

/** Defaults tuned to be invisible during normal interactive usage while blocking automated abuse. */
export const MESSAGING_RATE_LIMIT_DEFAULTS: MessagingRateLimitPolicy = {
  sendMaxPerWindow: 30,
  sendWindowSeconds: 60,
  contactMaxPerWindow: 10,
  contactWindowSeconds: 60,
};
