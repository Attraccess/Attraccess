export const APP_PARENT = 'app';
export const SMTP_PARENT = 'smtp';

export const APP_KEYS = {
  url: 'backend_url',
  publicInternetUrl: 'public_internet_url',
  licenseKey: 'license_key',
  cookieSameSite: 'cookie_same_site',
} as const;

/** Valid values for the SameSite cookie attribute. */
export type CookieSameSitePolicy = 'lax' | 'strict' | 'none';
export const COOKIE_SAME_SITE_VALUES: CookieSameSitePolicy[] = ['lax', 'strict', 'none'];
export const DEFAULT_COOKIE_SAME_SITE: CookieSameSitePolicy = 'lax';

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
