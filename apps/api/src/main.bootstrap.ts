import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe, ClassSerializerInterceptor, Logger, LogLevel } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import { ConfigService } from '@nestjs/config';
import { AppConfigType } from './config/app.config';
import { DataSource } from 'typeorm';
import { PluginService } from './plugin-system/plugin.service';
import { PluginModule } from './plugin-system/plugin.module';
import { HttpsOptions } from '@nestjs/common/interfaces/external/https-options.interface';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { createCA, createCert } from 'mkcert';
import { join } from 'path';
import { StorageConfigType } from './config/storage.config';
import cookieParser from 'cookie-parser';

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

export async function bootstrap() {
  const bootstrapLogger = new Logger('Bootstrap');
  bootstrapLogger.log('Starting bootstrap process...');

  const initialLogLevels = (process.env.LOG_LEVELS || 'error,warn,log')
    .split(',')
    .filter((level): level is LogLevel => ['error', 'warn', 'log', 'debug', 'verbose'].includes(level));

  const appForConfig = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: initialLogLevels,
  });

  const appConfig = appForConfig.get(ConfigService).get<AppConfigType>('app');
  const storageConfig = appForConfig.get(ConfigService).get<StorageConfigType>('storage');
  await appForConfig.close();

  let httpsOptions: undefined | HttpsOptions = undefined;

  let sslCertFile: string | undefined;
  let sslKeyFile: string | undefined;

  if (appConfig.SSL_GENERATE_SELF_SIGNED_CERTIFICATES) {
    const storageDir = storageConfig.root;

    const host = appConfig.ATTRACCESS_URL;
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

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: initialLogLevels,
    httpsOptions,
  });
  bootstrapLogger.log('Main application instance created.');

  app.use(cookieParser());

  app.enableCors({
    origin: appConfig.ATTRACCESS_FRONTEND_URL,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true, // Allow cookies to be sent
  });

  if (!appConfig) {
    bootstrapLogger.error("Application configuration ('app') not loaded. Exiting.");
    process.exit(1);
  }
  // Configure Plugin System
  bootstrapLogger.log('Configuring PluginSystem...');
  PluginService.configure({
    PLUGIN_DIR: appConfig.PLUGIN_DIR,
    RESTART_BY_EXIT: appConfig.RESTART_BY_EXIT,
  });
  PluginModule.configure({
    DISABLE_PLUGINS: appConfig.DISABLE_PLUGINS,
  });
  bootstrapLogger.log('PluginSystem configured.');

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
        `Pending migrations detected (${allMigrations.length} total known, ${executedMigrations.length} already executed). Running migrations...`
      );
      await dataSource.runMigrations();
      bootstrapLogger.log('Migrations completed successfully.');
    } else {
      bootstrapLogger.log('No pending migrations found.');
    }
  } catch (error) {
    bootstrapLogger.error('Failed to run database migrations');
    bootstrapLogger.error(error);
    process.exit(1);
  }

  const globalPrefix = appConfig.GLOBAL_PREFIX;
  app.setGlobalPrefix(globalPrefix);

  app.useWebSocketAdapter(new WsAdapter(app));

  // We dont use this for actual sessions/authentication
  // we need this for SSO logins since for those we need to persist some state between requests
  // TODO: if possible, refactor to use cookies or other less "hacky" methods
  app.use(
    session({
      secret: appConfig.AUTH_SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
    })
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
    })
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
