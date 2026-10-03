import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { SwaggerModule } from '@nestjs/swagger';
import { Body, Controller, Logger, Post } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { bootstrap } from './main.bootstrap';
import { SettingsService } from './settings/settings.service';
import { PluginService } from './plugin-system/plugin.service';
import { PluginModule } from './plugin-system/plugin.module';
import { NpmPluginService } from './plugin-system/npm-plugin.service';
import { PluginMigrationService } from './plugin-system/plugin-migration.service';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { createCert } from 'mkcert';
import { initializeProcessLogging } from './logging/process-logging';

jest.mock('./logging/process-logging', () => ({
  initializeProcessLogging: jest.fn(() => ({ log: jest.fn(), error: jest.fn(), warn: jest.fn() })),
  withLoggingLifecycle: jest.fn((module) => module),
}));

jest.mock('./app/app.module', () => ({ AppModule: class AppModule {} }));
jest.mock('./plugin-system/plugin.service', () => ({
  PluginService: {
    configure: jest.fn(),
    beginBootGuard: jest.fn(),
    recordBootFailure: jest.fn(),
  },
}));
jest.mock('./plugin-system/plugin.module', () => ({
  PluginModule: { configure: jest.fn(), resetHostReferences: jest.fn() },
}));
jest.mock('./plugin-system/npm-plugin.service', () => ({ NpmPluginService: { recoverBackups: jest.fn() } }));
jest.mock('./plugin-system/plugin-migration.service', () => ({
  PluginMigrationService: { runPendingUpMigrationsForAllPlugins: jest.fn() },
}));
jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return { ...actual, existsSync: jest.fn(actual.existsSync) };
});
jest.mock('fs/promises', () => ({ readFile: jest.fn(async () => Buffer.from('certificate')), writeFile: jest.fn() }));
jest.mock('mkcert', () => ({
  createCA: jest.fn(async () => ({ key: 'ca-key', cert: 'ca-cert' })),
  createCert: jest.fn(async () => ({ key: 'key', cert: 'cert' })),
}));

// Plugin controllers share the host's HTTP body parser. Echo a configuration
// request to verify that parsing preserves snapshots and draft conflict data.
@Controller('plugin-configuration')
class ConfigurationRequestController {
  @Post(':id/:action')
  receive(@Body() body: object) {
    return body;
  }
}

describe('API bootstrap ordering and configuration', () => {
  const appConfig = {
    PLUGIN_DIR: '/plugins',
    RESTART_BY_EXIT: true,
    DISABLE_PLUGINS: false,
    ATTRACCESS_URL: 'https://access.example',
    SSL_GENERATE_SELF_SIGNED_CERTIFICATES: false,
    TRUST_PROXY: '1',
    GLOBAL_PREFIX: 'api',
    AUTH_SESSION_SECRET: 'test-session-secret',
    VERSION: 'test',
    PORT: 3999,
    NODE_ENV: 'test',
    LOG_LEVELS: ['error', 'warn', 'log'],
  };
  const datasource = {
    isInitialized: false,
    initialize: jest.fn(),
    showMigrations: jest.fn(),
    runMigrations: jest.fn(),
    migrations: [],
  };
  const settings = { getUrl: jest.fn() };
  const config = { get: jest.fn((key: string) => (key === 'app' ? appConfig : { root: '/storage' })) };
  const early = { get: jest.fn(() => config), close: jest.fn(), useLogger: jest.fn() };
  const app = {
    get: jest.fn((token: unknown) => {
      if (token === ConfigService) return config;
      if (token === SettingsService) return settings;
      if (token === DataSource) return datasource;
      if (token === HttpAdapterHost) return { httpAdapter: {} };
      return {};
    }),
    close: jest.fn(),
    set: jest.fn(),
    useGlobalFilters: jest.fn(),
    use: jest.fn(),
    useBodyParser: jest.fn(),
    enableCors: jest.fn(),
    setGlobalPrefix: jest.fn(),
    useWebSocketAdapter: jest.fn(),
    useGlobalPipes: jest.fn(),
    useGlobalInterceptors: jest.fn(),
  };
  const originalSkip = process.env.SKIP_DATABASE_MIGRATIONS;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(existsSync).mockImplementation(jest.requireActual<typeof import('fs')>('fs').existsSync);
    delete process.env.SKIP_DATABASE_MIGRATIONS;
    appConfig.DISABLE_PLUGINS = false;
    appConfig.SSL_GENERATE_SELF_SIGNED_CERTIFICATES = false;
    appConfig.TRUST_PROXY = '1';
    datasource.isInitialized = false;
    datasource.showMigrations.mockResolvedValue(true);
    datasource.runMigrations.mockResolvedValue([]);
    settings.getUrl.mockResolvedValue('https://access.example');
    jest.spyOn(NestFactory, 'createApplicationContext').mockResolvedValue(early as never);
    jest.spyOn(NestFactory, 'create').mockResolvedValue(app as never);
    jest.spyOn(SwaggerModule, 'setup').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    Logger.detachBuffer();
    Logger.flush();
    jest.restoreAllMocks();
    if (originalSkip === undefined) delete process.env.SKIP_DATABASE_MIGRATIONS;
    else process.env.SKIP_DATABASE_MIGRATIONS = originalSkip;
  });

  describe('configuration request bodies (HTTP integration)', () => {
    let httpApp: NestExpressApplication;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        controllers: [ConfigurationRequestController],
        providers: [
          { provide: ConfigService, useValue: config },
          { provide: SettingsService, useValue: settings },
          { provide: DataSource, useValue: datasource },
        ],
      }).compile();
      httpApp = module.createNestApplication<NestExpressApplication>({ logger: false });
      jest
        .mocked(NestFactory.create)
        .mockResolvedValueOnce(app as never)
        .mockResolvedValueOnce(httpApp);
      await bootstrap();
      await httpApp.listen(0, '127.0.0.1');
    });

    afterEach(async () => {
      await httpApp?.close();
    });

    it.each([100 * 1024 + 1, 10 * 1024 * 1024])('parses configuration requests of %i bytes', async (bytes) => {
      const body = { snapshot: { version: 1, profile: '' } };
      body.snapshot.profile = 'x'.repeat(bytes - Buffer.byteLength(JSON.stringify(body)));
      const response = await request(httpApp.getHttpServer()).post('/api/plugin-configuration/1/validate').send(body);

      expect(response.body).not.toHaveProperty('message', 'request entity too large');
      expect(response.status).toBe(201);
      expect(response.body).toEqual(body);
    });

    it('saves a draft when its snapshot and optimistic concurrency data exceed 100 KiB together', async () => {
      const snapshot = { version: 1, profile: 'x'.repeat(60 * 1024) };
      const body = {
        snapshot,
        metadata: { labels: { point: 'Power meter' } },
        expectedDraft: {
          snapshot: JSON.stringify(snapshot),
          presetProvenance: null,
          updatedAt: '2026-10-03T12:00:00.000Z',
        },
      };
      const response = await request(httpApp.getHttpServer()).post('/api/plugin-configuration/1/draft').send(body);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(body);
    });

    it('keeps parsing small JSON requests', async () => {
      const body = { snapshot: { version: 1, physicalPoints: [], logicalChannels: [] } };
      const response = await request(httpApp.getHttpServer()).post('/api/plugin-configuration/1/validate').send(body);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(body);
    });

    it('still rejects JSON requests exceeding 10 MiB', async () => {
      const response = await request(httpApp.getHttpServer())
        .post('/api/plugin-configuration/1/draft')
        .send({ snapshot: 'x'.repeat(10 * 1024 * 1024) });

      expect(response.status).toBe(413);
      expect(response.body.message).toBe('request entity too large');
    });

    it('still rejects malformed JSON', async () => {
      await request(httpApp.getHttpServer())
        .post('/api/plugin-configuration/1/draft')
        .set('Content-Type', 'application/json')
        .send('{"snapshot":')
        .expect(400);
    });

    it('keeps parsing URL-encoded requests used by SSO callbacks', async () => {
      const body = { SAMLResponse: 'test-response', RelayState: 'test-state' };
      const response = await request(httpApp.getHttpServer())
        .post('/api/plugin-configuration/1/draft')
        .type('form')
        .send(body);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(body);
    });
  });

  it('configures plugins and migrates before returning the configured application', async () => {
    const result = await bootstrap();
    expect(result).toMatchObject({
      app,
      globalPrefix: 'api',
      port: 3999,
      nodeEnv: 'test',
      shouldGuardPluginLifecycle: true,
    });
    expect(PluginService.configure).toHaveBeenCalledWith({ PLUGIN_DIR: '/plugins', RESTART_BY_EXIT: true });
    expect(PluginModule.configure).toHaveBeenCalledWith({ DISABLE_PLUGINS: false });
    expect(NpmPluginService.recoverBackups).toHaveBeenCalled();
    expect(PluginService.beginBootGuard).toHaveBeenCalled();
    expect(NestFactory.create).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ abortOnError: false }),
    );
    expect(NestFactory.create).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ abortOnError: false }),
    );
    expect(PluginMigrationService.runPendingUpMigrationsForAllPlugins).toHaveBeenCalled();
    const migrationOrder = jest.mocked(PluginMigrationService.runPendingUpMigrationsForAllPlugins).mock
      .invocationCallOrder[0];
    expect(migrationOrder).toBeLessThan(jest.mocked(NestFactory.create).mock.invocationCallOrder[0]);
    expect(early.close).toHaveBeenCalled();
    expect(initializeProcessLogging).toHaveBeenCalledTimes(1);
    expect(early.useLogger).toHaveBeenCalledWith(jest.mocked(initializeProcessLogging).mock.results[0].value);
    expect(PluginModule.resetHostReferences).toHaveBeenCalled();
    expect(datasource.initialize).toHaveBeenCalled();
    expect(datasource.runMigrations).toHaveBeenCalled();
    expect(app.set).toHaveBeenCalledWith('trust proxy', 1);
    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(SwaggerModule.setup).toHaveBeenCalledWith('api', app, expect.any(Function));
  });
  it('honors migration skips and disabled plugins without opening the database', async () => {
    process.env.SKIP_DATABASE_MIGRATIONS = 'true';
    appConfig.DISABLE_PLUGINS = true;
    const result = await bootstrap();
    expect(result.shouldGuardPluginLifecycle).toBe(false);
    expect(PluginService.beginBootGuard).not.toHaveBeenCalled();
    expect(PluginMigrationService.runPendingUpMigrationsForAllPlugins).not.toHaveBeenCalled();
    expect(datasource.initialize).not.toHaveBeenCalled();
    expect(datasource.runMigrations).not.toHaveBeenCalled();
    expect(settings.getUrl).not.toHaveBeenCalled();
  });
  it('loads generated TLS files and trusts no proxy when the configured value is invalid', async () => {
    appConfig.SSL_GENERATE_SELF_SIGNED_CERTIFICATES = true;
    appConfig.TRUST_PROXY = 'untrusted nonsense';
    jest.mocked(existsSync).mockReturnValue(false);
    await bootstrap();
    expect(createCert).toHaveBeenCalledWith(
      expect.objectContaining({ domains: ['127.0.0.1', 'localhost', 'access.example'] }),
    );
    expect(writeFile).toHaveBeenCalledWith('/storage/access.example.key', 'key', { mode: 0o644 });
    expect(readFile).toHaveBeenCalledWith('/storage/access.example.pem');
    expect(NestFactory.create).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ httpsOptions: { cert: Buffer.from('certificate'), key: Buffer.from('certificate') } }),
    );
    expect(app.set).toHaveBeenCalledWith('trust proxy', false);
  });
  it('records migration failures and stops boot before accepting requests', async () => {
    const error = new Error('migration failed');
    datasource.runMigrations.mockRejectedValue(error);
    await expect(bootstrap()).rejects.toThrow('migration failed');
    expect(PluginService.recordBootFailure).toHaveBeenCalledWith(error);
    expect(app.setGlobalPrefix).not.toHaveBeenCalled();
  });
});
