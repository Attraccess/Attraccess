export const APP_PARENT = 'app';
export const SMTP_PARENT = 'smtp';
export const AI_PARENT = 'ai';

export const APP_KEYS = {
  url: 'backend_url',
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

export const AI_KEYS = {
  enabled: 'enabled',
  ollamaBaseUrl: 'ollama_base_url',
  chatModel: 'chat_model',
  embedModel: 'embed_model',
  maxContextChunks: 'max_context_chunks',
} as const;

/** Cache TTL for settings reads. Writes update cache immediately; this only affects reads when DB is changed outside this process. */
export const SETTINGS_CACHE_TTL_MS = 60 * 1000; // 1 minute
