import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe, ClassSerializerInterceptor, Logger, LogLevel, Module } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import appConfiguration, { AppConfigType } from './config/app.config';
import { DataSource } from 'typeorm';
import { PluginService } from './plugin-system/plugin.service';
import { PluginModule } from './plugin-system/plugin.module';
import { NpmPluginService } from './plugin-system/npm-plugin.service';
import { PluginMigrationService } from './plugin-system/plugin-migration.service';
import { HttpsOptions } from '@nestjs/common/interfaces/external/https-options.interface';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { createCA, createCert } from 'mkcert';
import { join } from 'path';
import { StorageConfigType } from './config/storage.config';
import cookieParser from 'cookie-parser';
import { SqliteReadonlyFilter } from './exceptions/sqlite-readonly.filter';
import { SettingsService } from './settings/settings.service';
import { isValidTrustProxyValue, resolveTrustProxySetting } from './trust-proxy';

async function generateSelfSignedCertificates(storageDir: string, domain: string) {
  const ca = await createCA({
    organization: 'Attraccess',
    countryCode: 'DE',
    state: 'Hamburg',
    locality: 'Hamburg',
    validity: 365,
  });

  const cert = await createCert({
    ca: { key: ca.key, cert: ca.cert },
    domains: ['127.0.0.1', 'localhost', domain],
    validity: 365,
  });

  await writeFile(join(storageDir, `${domain}.pem`), cert.cert, { mode: 0o644 });
  await writeFile(join(storageDir, `${domain}.key`), cert.key, { mode: 0o644 });
}

// Minimal module used to read AppConfig (and load the .env file) WITHOUT importing
// AppModule. The plugin system must be configured before AppModule is imported,
// because PluginModule.forRoot() — evaluated at AppModule import time — imports each
// plugin's backend module from PLUGIN_DIR. If AppModule were imported first to read
// config, forRoot() would already have run with an unconfigured path and no plugin
// backend would ever load.
@Module({
  imports: [NestConfigModule.forRoot({ load: [appConfiguration], isGlobal: true })],
})
class PluginBootstrapConfigModule {}

export async function bootstrap() {
  const bootstrapLogger = new Logger('Bootstrap');
  bootstrapLogger.log('Starting bootstrap process...');
  const skipDatabaseMigrations = process.env.SKIP_DATABASE_MIGRATIONS === 'true';

  const initialLogLevels = (process.env.LOG_LEVELS || 'error,warn,log')
    .split(',')
    .filter((level): level is LogLevel => ['error', 'warn', 'log', 'debug', 'verbose'].includes(level));

  // Resolve plugin config and configure the plugin system BEFORE importing AppModule
  // (see PluginBootstrapConfigModule above for why ordering matters).
  const configContext = await NestFactory.createApplicationContext(PluginBootstrapConfigModule, {
    logger: initialLogLevels,
  });
  const earlyConfig = configContext.get(ConfigService).get<AppConfigType>('app');
  await configContext.close();

  if (!earlyConfig) {
    bootstrapLogger.error("Application configuration ('app') not loaded. Exiting.");
    process.exit(1);
  }
  if (!earlyConfig.PLUGIN_DIR) {
    bootstrapLogger.warn('PLUGIN_DIR is not set — plugin backends will not be loaded.');
  }
  bootstrapLogger.log('Configuring PluginSystem...');
  PluginService.configure({
    PLUGIN_DIR: earlyConfig.PLUGIN_DIR,
    RESTART_BY_EXIT: earlyConfig.RESTART_BY_EXIT,
  });
  PluginModule.configure({
    DISABLE_PLUGINS: earlyConfig.DISABLE_PLUGINS,
  });
  // Restore a known-good package before migrations or module discovery can load
  // code left behind by an interrupted npm plugin replacement.
  if (earlyConfig.PLUGIN_DIR) await NpmPluginService.recoverBackups();
  bootstrapLogger.log('PluginSystem configured.');

  // Record active plugins before migrations or module loading execute plugin code.
  const shouldGuardPluginLifecycle = !earlyConfig.DISABLE_PLUGINS && Boolean(earlyConfig.PLUGIN_DIR);
  if (shouldGuardPluginLifecycle) PluginService.beginBootGuard();

  // Run plugin-shipped up-migrations BEFORE AppModule is imported, so every
  // plugin's tables exist before any plugin code (its onModuleInit) runs. This
  // uses a standalone DataSource per plugin against the same DB, so it does not
  // interfere with the host DataSource (which opens later, inside AppModule).
  // Per-plugin failures are isolated inside the service and never abort boot.
  if (!earlyConfig.DISABLE_PLUGINS && !skipDatabaseMigrations) {
    bootstrapLogger.log('Running plugin database migrations...');
    await PluginMigrationService.runPendingUpMigrationsForAllPlugins();
  } else if (skipDatabaseMigrations) {
    bootstrapLogger.log('Skipping plugin database migrations.');
  }

  // Import AppModule only now, so PluginModule.forRoot() sees the configured PLUGIN_DIR.
  const { AppModule } = await import('./app/app.module');

  const appForConfig = await NestFactory.create<NestExpressApplication>(AppModule, { logger: initialLogLevels });
  if (shouldGuardPluginLifecycle) PluginService.clearBootGuard();

  const appConfig = appForConfig.get(ConfigService).get<AppConfigType>('app');
  const storageConfig = appForConfig.get(ConfigService).get<StorageConfigType>('storage');
  const backendUrlFromDb = skipDatabaseMigrations
    ? appConfig.ATTRACCESS_URL
    : await appForConfig.get(SettingsService).getUrl();
  await appForConfig.close();

  let httpsOptions: undefined | HttpsOptions = undefined;

  let sslCertFile: string | undefined;
  let sslKeyFile: string | undefined;

  if (appConfig.SSL_GENERATE_SELF_SIGNED_CERTIFICATES) {
    const storageDir = storageConfig.root;
    const host = backendUrlFromDb ?? appConfig.ATTRACCESS_URL;
    if (!host) {
      throw new Error(
        'Backend URL is required to generate self-signed certificates. Configure it in Settings or set ATTRACCESS_URL.',
      );
    }
    const hostUrl = new URL(host);
    const domain = hostUrl.hostname;

    if (!existsSync(`${domain}.pem`) || !existsSync(`${domain}.key`)) {
      bootstrapLogger.log('Generating self-signed certificates...');
      await generateSelfSignedCertificates(storageDir, domain);
    }

    sslCertFile = join(storageDir, `${domain}.pem`);
    sslKeyFile = join(storageDir, `${domain}.key`);
  }

  if (sslCertFile && sslKeyFile) {
    httpsOptions = {
      cert: await readFile(sslCertFile),
      key: await readFile(sslKeyFile),
    };
  }

  if (shouldGuardPluginLifecycle) PluginService.beginBootGuard();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: initialLogLevels,
    httpsOptions,
  });
  if (shouldGuardPluginLifecycle) PluginService.clearBootGuard();
  bootstrapLogger.log('Main application instance created.');

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

  if (skipDatabaseMigrations) {
    bootstrapLogger.log('Skipping database migrations.');
  } else {
    // Run migrations before the app fully starts
    try {
      bootstrapLogger.log('Running database migrations...');
      const dataSource = app.get(DataSource);

      if (!dataSource.isInitialized) {
        await dataSource.initialize();
        bootstrapLogger.log('Database connection initialized.');
      }

      const pendingMigrations = await dataSource.showMigrations();
      if (pendingMigrations) {
        const allMigrations = dataSource.migrations;
        const executedMigrations = dataSource.migrations;
        bootstrapLogger.log(
          `Pending migrations detected (${allMigrations.length} total known, ${executedMigrations.length} already executed). Running migrations...`,
        );
        await dataSource.runMigrations();
        bootstrapLogger.log('Migrations completed successfully.');
      } else {
        bootstrapLogger.log('No pending migrations found.');
      }
    } catch (error) {
      bootstrapLogger.error('Failed to run database migrations');
      bootstrapLogger.error(error);
      PluginService.recordBootFailure(error);
      process.exit(1);
    }
  }

  const globalPrefix = appConfig.GLOBAL_PREFIX;
  app.setGlobalPrefix(globalPrefix);

  app.useWebSocketAdapter(new WsAdapter(app));

  const appUrl = skipDatabaseMigrations ? appConfig.ATTRACCESS_URL : await app.get(SettingsService).getUrl();

  // Session middleware is used for SAML SSO state persistence only (not for regular auth).
  // OIDC state is handled by OidcCookieStateStore (a signed oidc-state cookie) instead.
  // Cookie is explicitly SameSite=Lax so it survives IdP redirects (cross-site top-level navigations).
  app.use(
    session({
      secret: appConfig.AUTH_SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        sameSite: 'lax', // must be lax — strict would block SAML IdP redirect callbacks
        secure: appUrl?.startsWith('https://') ?? false,
        httpOnly: true,
      },
    }),
  );

  bootstrapLogger.log(`🚀 Application is running with global prefix: ${globalPrefix}`);
  bootstrapLogger.log(`📝 Enabled log levels: ${initialLogLevels.join(', ')}`);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get('Reflector')));

  const config = new DocumentBuilder()
    .setTitle('Attraccess API')
    .setDescription('The Attraccess API used to manage machine and tool access in a Makerspace or FabLab')
    .setVersion(appConfig.VERSION)
    .addBearerAuth()
    .addApiKey({
      type: 'apiKey',
      in: 'header',
      name: 'x-api-key',
    })
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  const port = appConfig.PORT;
  // Listening and related logging will be handled by startListening function
  bootstrapLogger.log('Bootstrap process completed.');
  return { app, globalPrefix, swaggerDocumentFactory: documentFactory, port, nodeEnv: appConfig.NODE_ENV };
}

export async function startListening(app: NestExpressApplication, port: number, globalPrefix: string, nodeEnv: string) {
  const applicationLogger = new Logger('Application');
  await app.listen(port, '0.0.0.0');
  applicationLogger.log(`🚀 Application listening on port ${port} in ${nodeEnv} mode`);
  const swaggerPath = globalPrefix ? `/${globalPrefix}` : '/api';
  applicationLogger.log(`Swagger UI available at http://localhost:${port}${swaggerPath}`);
}
