import { Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppConfigType } from './config/app.config';
import { SqliteReadonlyFilter } from './exceptions/sqlite-readonly.filter';
import { isValidTrustProxyValue, resolveTrustProxySetting } from './trust-proxy';

export function configureBootstrapHttp(app: NestExpressApplication, appConfig: AppConfigType, bootstrapLogger: Logger) {
  // Plugin configurations can include large device profiles and a previous
  // draft for conflict detection, exceeding Express's default 100 KiB limit.
  app.useBodyParser('json', { limit: '10mb' });

  // Behind a reverse proxy, X-Forwarded-For only reflects the real client IP when Express is told
  // how many proxy hops to trust. Without this, auth rate limiting buckets every request under the
  // proxy IP. Opt-in via TRUST_PROXY (default off) so a misconfiguration can never be self-spoofed.
  const trustProxyRaw = appConfig.TRUST_PROXY;
  const trustProxyValid = isValidTrustProxyValue(trustProxyRaw);
  if (trustProxyRaw && !trustProxyValid) {
    bootstrapLogger.warn(
      `Invalid TRUST_PROXY value "${trustProxyRaw}"; trusting no proxy. ` +
        'Use a hop count (e.g. "1"), "true"/"false", or a comma-separated list of IPs/CIDRs/presets (loopback, linklocal, uniquelocal).',
    );
  }
  const trustProxy = trustProxyValid ? resolveTrustProxySetting(trustProxyRaw) : false;
  try {
    app.set('trust proxy', trustProxy);
    bootstrapLogger.log(`Express "trust proxy" set to: ${JSON.stringify(trustProxy)}`);
  } catch (error) {
    bootstrapLogger.error(`Failed to apply TRUST_PROXY "${trustProxyRaw}"; trusting no proxy.`, error as Error);
    app.set('trust proxy', false);
  }

  app.useGlobalFilters(new SqliteReadonlyFilter(app.get(HttpAdapterHost)));

  app.use(cookieParser());

  app.enableCors({
    origin: (requestOrigin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, curl, mobile apps)
      if (!requestOrigin) {
        return callback(null, true);
      }

      return callback(null, requestOrigin);
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true, // Allow cookies to be sent
  });
}
