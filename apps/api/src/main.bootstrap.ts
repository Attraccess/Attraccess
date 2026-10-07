import { Logger, Module } from '@nestjs/common';
import { ConfigService, ConfigModule as NestConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { configureBootstrapApi } from './bootstrap-api';
import { configureBootstrapHttp } from './bootstrap-http';
import { loadBootstrapTls } from './bootstrap-tls';
import appConfiguration, { AppConfigType } from './config/app.config';
import { StorageConfigType } from './config/storage.config';
import { initializeProcessLogging, withLoggingLifecycle } from './logging/process-logging';
import { NpmPluginService } from './plugin-system/npm-plugin.service';
import { PluginMigrationService } from './plugin-system/plugin-migration.service';
import { PluginModule } from './plugin-system/plugin.module';
import { PluginService } from './plugin-system/plugin.service';
import { SettingsService } from './settings/settings.service';

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
  Logger.attachBuffer();
  const bootstrapLogger = new Logger('Bootstrap');
  bootstrapLogger.log('Starting bootstrap process...');
  const skipDatabaseMigrations = process.env.SKIP_DATABASE_MIGRATIONS === 'true';

  // Resolve plugin config and configure the plugin system BEFORE importing AppModule
  // (see PluginBootstrapConfigModule above for why ordering matters).
  const configContext = await NestFactory.createApplicationContext(PluginBootstrapConfigModule, {
    bufferLogs: true,
    autoFlushLogs: false,
    abortOnError: false,
  });
  let earlyConfig: AppConfigType;
  let routingLogger: ReturnType<typeof initializeProcessLogging>;
  try {
    earlyConfig = configContext.get(ConfigService).get<AppConfigType>('app');
    // The config context has now loaded .env. Configure once, then replay the
    // buffered framework/bootstrap entries once through all active destinations.
    routingLogger = initializeProcessLogging();
    configContext.useLogger(routingLogger);
    Logger.flush();
  } finally {
    await configContext.close();
  }

  if (!earlyConfig) {
    bootstrapLogger.error("Application configuration ('app') not loaded. Exiting.");
    throw new Error("Application configuration ('app') not loaded.");
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

  const appForConfig = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: routingLogger,
    abortOnError: false,
  });

  const appConfig = appForConfig.get(ConfigService).get<AppConfigType>('app');
  const storageConfig = appForConfig.get(ConfigService).get<StorageConfigType>('storage');
  const backendUrlFromDb = skipDatabaseMigrations
    ? appConfig.ATTRACCESS_URL
    : await appForConfig.get(SettingsService).getUrl();
  await appForConfig.close();
  // AppModule is constructed again below. Plugin providers in that application
  // must not receive repositories from the closed configuration DataSource.
  PluginModule.resetHostReferences();

  const httpsOptions = await loadBootstrapTls(appConfig, storageConfig, backendUrlFromDb, bootstrapLogger);

  const app = await NestFactory.create<NestExpressApplication>(withLoggingLifecycle(AppModule), {
    logger: routingLogger,
    httpsOptions,
    abortOnError: false,
  });
  bootstrapLogger.log('Main application instance created.');

  configureBootstrapHttp(app, appConfig, bootstrapLogger);

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
      throw error;
    }
  }

  const { globalPrefix, documentFactory } = await configureBootstrapApi(
    app,
    appConfig,
    skipDatabaseMigrations,
    bootstrapLogger,
  );

  const port = appConfig.PORT;
  // Listening and related logging will be handled by startListening function
  bootstrapLogger.log('Bootstrap process completed.');
  return {
    app,
    globalPrefix,
    swaggerDocumentFactory: documentFactory,
    port,
    nodeEnv: appConfig.NODE_ENV,
    shouldGuardPluginLifecycle,
  };
}

export async function startListening(app: NestExpressApplication, port: number, globalPrefix: string, nodeEnv: string) {
  const applicationLogger = new Logger('Application');
  await app.listen(port, '0.0.0.0');
  applicationLogger.log(`🚀 Application listening on port ${port} in ${nodeEnv} mode`);
  const swaggerPath = globalPrefix ? `/${globalPrefix}` : '/api';
  applicationLogger.log(`Swagger UI available at http://localhost:${port}${swaggerPath}`);
}
