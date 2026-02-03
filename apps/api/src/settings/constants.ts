export const APP_PARENT = 'app';
export const SMTP_PARENT = 'smtp';

export const APP_KEYS = {
  frontendUrl: 'frontend_url',
  backendUrl: 'backend_url',
  publicInternetUrl: 'public_internet_url',
  licenseKey: 'license_key',
} as const;

export const SMTP_KEYS = {
  service: 'service',
  host: 'host',
  port: 'port',
  secure: 'secure',
  user: 'user',
  pass: 'pass',
  from: 'from',
} as const;

export const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000;
