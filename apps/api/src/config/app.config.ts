import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { READER_UI_TIMING } from '@attraccess/plugins-backend-sdk';
import { logDestinationsSchema, logLevelsSchema } from '../logging/logging.config';
import { join } from 'path';
import { DEFAULT_STORAGE_ROOT } from './storage.config';
import { parseDatabaseTypeValue } from '../database/backend/database-type';

const PLACEHOLDER_VERSIONS = new Set(['', '0.0.0', 'undefined', 'null']);
export const DEFAULT_PLUGIN_DIR = join(DEFAULT_STORAGE_ROOT, 'plugins');

export const BUILD_TIME_VERSION: string | undefined = process.env.ATTRACCESS_VERSION;

export function resolveAppVersion(
  env: NodeJS.ProcessEnv = process.env,
  buildTimeVersion: string | undefined = BUILD_TIME_VERSION,
): string {
  const candidates = [buildTimeVersion, env.ATTRACCESS_VERSION, env.npm_package_version];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (trimmed.length === 0) continue;
    if (PLACEHOLDER_VERSIONS.has(trimmed)) continue;
    return trimmed;
  }
  return '0.0.0-dev';
}

export const PLUGIN_CHANNELS = ['latest', 'next'] as const;
export type PluginChannel = (typeof PLUGIN_CHANNELS)[number];

/**
 * The npm dist-tag a host installs plugins from by default: `next` on nightly images (see the Dockerfile), `latest`
 * everywhere else. Blank means unset; any other unknown value is rejected at boot by the app config schema.
 */
export function resolvePluginChannel(env: NodeJS.ProcessEnv = process.env): PluginChannel {
  return env.ATTRACCESS_PLUGIN_CHANNEL?.trim() === 'next' ? 'next' : 'latest';
}

export function resolvePluginDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.PLUGIN_DIR ?? join(env.STORAGE_ROOT ?? DEFAULT_STORAGE_ROOT, 'plugins');
}

/**
 * DATABASE_TYPE as the backend registry reads it (blanks and case ignored, unset or empty selects postgres), with the
 * same message for an unsupported value. The message never echoes a value that is not a plain name.
 */
const databaseTypeSchema = z
  .unknown()
  .optional()
  .transform((value, context) => {
    try {
      return parseDatabaseTypeValue(value);
    } catch (error) {
      context.addIssue({ code: 'custom', message: (error as Error).message });
      return z.NEVER;
    }
  });

export const AppEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    /** Database engine. Only `postgres` is supported; validated before any connection (see database/backend). */
    DATABASE_TYPE: databaseTypeSchema,
    /** Connection settings of the database. Required at startup (see database/postgres/postgres-config); errors never echo values. */
    DATABASE_URL: z.string().optional(),
    DATABASE_SSL: z.string().optional(),
    DATABASE_POOL_MAX: z.string().optional(),
    DATABASE_SCHEMA: z.string().optional(),
    LOG_LEVELS: logLevelsSchema,
    LOG_DESTINATIONS: logDestinationsSchema,
    LOG_FILE_PATH: z.string().optional(),
    AUTH_SESSION_SECRET: z.string().min(1, { message: 'AUTH_SESSION_SECRET is required' }),
    ATTRACCESS_URL: z.string().url().optional(),
    ATTRACCESS_FRONTEND_URL: z.string().url().optional(),
    ATTRACCESS_PUBLIC_INTERNET_URL: z.string().url().optional(),
    ATTRACCESS_TRUSTED_ORIGINS: z.string().optional(),
    /** Optional static MCP OAuth clients (JSON array of { client_id, client_name?, redirect_uris }); most clients register themselves. */
    MCP_OAUTH_CLIENTS: z.string().optional(),
    VERSION: z.string().default(resolveAppVersion()),
    COMMIT_SHA: z.string().optional(),
    STATIC_FRONTEND_FILE_PATH: z.string().optional(),
    STATIC_DOCS_FILE_PATH: z.string().optional(),
    /** Plugin release channel: the npm dist-tag marketplace and installs use by default. Blank is the default `latest`. */
    ATTRACCESS_PLUGIN_CHANNEL: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.enum(PLUGIN_CHANNELS).default('latest'),
    ),
    PLUGIN_DIR: z.string().min(1).default(resolvePluginDir),
    RESTART_BY_EXIT: z.coerce.boolean().default(false),
    DISABLE_PLUGINS: z.coerce.boolean().default(false),
    SSL_GENERATE_SELF_SIGNED_CERTIFICATES: z.coerce.boolean().default(false),
    SSL_KEY_FILE: z.string().optional(),
    SSL_CERT_FILE: z.string().optional(),
    TRUST_PROXY: z.string().optional(),
    /** Plugin pre-start / session-end hook timeout; the host caps it at 3 s. */
    READER_UI_HOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(READER_UI_TIMING.hookDefaultTimeoutMs),
    /** Consecutive hook failures that open a plugin's circuit breaker. */
    READER_UI_BREAKER_THRESHOLD: z.coerce.number().int().positive().default(READER_UI_TIMING.breakerThreshold),
  })
  .refine(
    (config) => {
      if (config.SSL_GENERATE_SELF_SIGNED_CERTIFICATES && (config.SSL_KEY_FILE || config.SSL_CERT_FILE)) {
        return {
          message:
            'SSL_KEY_FILE and SSL_CERT_FILE must not be provided if SSL_GENERATE_SELF_SIGNED_CERTIFICATES is true',
        };
      }

      if ((config.SSL_KEY_FILE && !config.SSL_CERT_FILE) || (!config.SSL_KEY_FILE && config.SSL_CERT_FILE)) {
        return {
          message: 'SSL_KEY_FILE and SSL_CERT_FILE must be provided together',
        };
      }

      return true;
    },
    { message: 'Invalid SSL configuration' },
  );

export type AppConfigType = z.infer<typeof AppEnvSchema> & {
  GLOBAL_PREFIX: string;
  LICENSO_PUBLIC_KEY: string;
};

const appConfigFactory = (): AppConfigType => {
  try {
    const ATTRACCESS_URL_ENV = process.env.ATTRACCESS_URL ?? process.env.VITE_ATTRACCESS_URL;
    const ATTRACCESS_PUBLIC_INTERNET_URL_ENV = process.env.ATTRACCESS_PUBLIC_INTERNET_URL ?? ATTRACCESS_URL_ENV;

    const env = AppEnvSchema.parse({
      ...process.env,
      ATTRACCESS_URL: ATTRACCESS_URL_ENV,
      ATTRACCESS_PUBLIC_INTERNET_URL: ATTRACCESS_PUBLIC_INTERNET_URL_ENV,
      PLUGIN_DIR: resolvePluginDir(),
    });

    return {
      ...env,
      GLOBAL_PREFIX: 'api',
      LICENSO_PUBLIC_KEY: 'oPN_IZFgPiWDNcfHfXwVoDZ7DAm8JcezucY3EVy1wTI',
    };
  } catch (e) {
    const issues = e?.issues ?? e?.errors;
    const zodErrors = Array.isArray(issues)
      ? issues
          .map((err) => {
            const path = Array.isArray(err?.path) ? err.path.join('.') : '';
            return path ? `${path}: ${err?.message}` : `${err?.message}`;
          })
          .join('; ')
      : (e?.message ?? String(e));

    // eslint-disable-next-line no-console
    console.error('Failed to parse App Environment Variables:', zodErrors);
    throw new Error(zodErrors, { cause: e });
  }
};

export default registerAs('app', appConfigFactory);
