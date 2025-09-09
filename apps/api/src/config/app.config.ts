import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { LogLevel } from '@nestjs/common';

const AppEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LICENSE_KEY: z
      .string({
        error:
          'LICENSE_KEY is required. If you are a non-profit organization, you may use Attraccess for free by setting LICENSE_KEY to: "I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md"',
      })
      .min(1, {
        message:
          'LICENSE_KEY must not be empty. Non-profits can set LICENSE_KEY to: "I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md"',
      }),
    PORT: z.coerce.number().default(3000),
    LOG_LEVELS: z
      .string()
      .default('log,error,warn')
      .transform(
        (val) =>
          val
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean) as LogLevel[]
      )
      .refine((levels) => levels.every((l) => ['log', 'error', 'warn', 'debug', 'verbose'].includes(l)), {
        message: 'Invalid log level(s). Allowed: log, error, warn, debug, verbose.',
      }),
    AUTH_SESSION_SECRET: z.string().min(1, { message: 'AUTH_SESSION_SECRET is required' }),
    ATTRACCESS_URL: z.string().url({ message: 'ATTRACCESS_URL must be a valid URL' }),
    ATTRACCESS_FRONTEND_URL: z.string().url({ message: 'ATTRACCESS_FRONTEND_URL must be a valid URL' }),
    VERSION: z.string().default(process.env.npm_package_version || '1.0.0'),
    STATIC_FRONTEND_FILE_PATH: z.string().optional(),
    STATIC_DOCS_FILE_PATH: z.string().optional(),
    PLUGIN_DIR: z.string().optional(),
    RESTART_BY_EXIT: z.coerce.boolean().default(false),
    DISABLE_PLUGINS: z.coerce.boolean().default(false),
    SSL_GENERATE_SELF_SIGNED_CERTIFICATES: z.coerce.boolean().default(false),
    SSL_KEY_FILE: z.string().optional(),
    SSL_CERT_FILE: z.string().optional(),
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
    { message: 'Invalid SSL configuration' }
  );

export type AppConfigType = z.infer<typeof AppEnvSchema> & {
  GLOBAL_PREFIX: string;
  LICENSO_PUBLIC_KEY: string;
  LICENSO_DEVICE_ID: string;
};

const appConfigFactory = (): AppConfigType => {
  try {
    const env = AppEnvSchema.parse({
      ...process.env,
      ATTRACCESS_FRONTEND_URL:
        process.env.ATTRACCESS_FRONTEND_URL ??
        process.env.FRONTEND_URL ??
        process.env.ATTRACCESS_URL ??
        process.env.VITE_ATTRACCESS_URL,
      ATTRACCESS_URL: process.env.ATTRACCESS_URL ?? process.env.VITE_ATTRACCESS_URL,
    });

    let licensoDeviceId = env.ATTRACCESS_FRONTEND_URL;
    licensoDeviceId = licensoDeviceId.replace('https://', '');
    licensoDeviceId = licensoDeviceId.replace('http://', '');

    return {
      ...env,
      GLOBAL_PREFIX: 'api',
      LICENSO_PUBLIC_KEY: 'oPN_IZFgPiWDNcfHfXwVoDZ7DAm8JcezucY3EVy1wTI',
      LICENSO_DEVICE_ID: licensoDeviceId,
    };
  } catch (e) {
    const zodErrors = Array.isArray(e?.errors)
      ? e.errors
          .map((err) => {
            const path = Array.isArray(err?.path) ? err.path.join('.') : '';
            return path ? `${path}: ${err?.message}` : `${err?.message}`;
          })
          .join('; ')
      : e?.message ?? String(e);
    console.error('Failed to parse App Environment Variables:', zodErrors);
    throw new Error(zodErrors);
  }
};

export default registerAs('app', appConfigFactory);
