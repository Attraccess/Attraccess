import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { LogLevel } from '@nestjs/common';
import * as path from 'path';

const PLACEHOLDER_VERSIONS = new Set(['', '0.0.0', 'undefined', 'null']);

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

export const AppEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    LOG_LEVELS: z
      .string()
      .default('log,error,warn')
      .transform(
        (val) =>
          val
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean) as LogLevel[],
      )
      .refine((levels) => levels.every((l) => ['log', 'error', 'warn', 'debug', 'verbose'].includes(l)), {
        message: 'Invalid log level(s). Allowed: log, error, warn, debug, verbose.',
      }),
    AUTH_SESSION_SECRET: z.string().min(1, { message: 'AUTH_SESSION_SECRET is required' }),
    ATTRACCESS_URL: z.string().url().optional(),
    ATTRACCESS_PUBLIC_INTERNET_URL: z.string().url().optional(),
    VERSION: z.string().default(resolveAppVersion()),
    COMMIT_SHA: z.string().optional(),
    STATIC_FRONTEND_FILE_PATH: z.string().optional(),
    STATIC_DOCS_FILE_PATH: z.string().optional(),
    // The documented default (docs/*/plugins/overview.md) — leaving it unset used
    // to make plugin upload fail deep inside path.join() with "path must be of
    // type string", since only the Dockerfile ever supplied a value.
    PLUGIN_DIR: z
      .string()
      .default(() => path.join(process.env.STORAGE_ROOT ?? path.join(process.cwd(), 'storage'), 'plugins')),
    RESTART_BY_EXIT: z.coerce.boolean().default(false),
    DISABLE_PLUGINS: z.coerce.boolean().default(false),
    SSL_GENERATE_SELF_SIGNED_CERTIFICATES: z.coerce.boolean().default(false),
    SSL_KEY_FILE: z.string().optional(),
    SSL_CERT_FILE: z.string().optional(),
    TRUST_PROXY: z.string().optional(),
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
    });

    return {
      ...env,
      GLOBAL_PREFIX: 'api',
      LICENSO_PUBLIC_KEY: 'oPN_IZFgPiWDNcfHfXwVoDZ7DAm8JcezucY3EVy1wTI',
    };
  } catch (e) {
    const zodErrors = Array.isArray(e?.errors)
      ? e.errors
          .map((err) => {
            const path = Array.isArray(err?.path) ? err.path.join('.') : '';
            return path ? `${path}: ${err?.message}` : `${err?.message}`;
          })
          .join('; ')
      : (e?.message ?? String(e));

    // eslint-disable-next-line no-console
    console.error('Failed to parse App Environment Variables:', zodErrors);
    throw new Error(zodErrors);
  }
};

export default registerAs('app', appConfigFactory);
