import 'reflect-metadata';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, MigrationInterface } from 'typeorm';
import type { PluginBackendAdapters } from '@attraccess/plugins-backend-sdk/adapter';
import type { PluginContext as NeutralPluginContext } from '@attraccess/plugins-backend-sdk/v2';
import { SqlitePluginAdapters } from '../persistence/plugin-adapters';
import request from 'supertest';
import { User } from '@attraccess/database-entities';
import type { PluginContext as LegacyPluginContext } from '@attraccess/plugins-backend-sdk';
import { PluginPermission } from '@attraccess/plugins-backend-sdk/v2';
import type { PluginBackendModule } from '@attraccess/plugins-backend-sdk/v2';
import { dataSourceConfig } from '../../database/datasource';
import { SqlitePluginHostOperations } from '../persistence/typeorm-adapter';
import { createNeutralGuardedContext } from '../runtime/guarded-context';
import { loadPluginEntryExports } from '../runtime/module-loader';
import { LegacyPluginSandbox } from '../persistence/legacy-context';

describe('standalone neutral Hello World backend', () => {
  let root: string;
  let source: DataSource;
  let plugin: PluginBackendModule;
  let app: NestExpressApplication | undefined;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'attraccess-neutral-example-'));
    const outfile = join(root, 'plugin.cjs');
    const artifact = await build({
      entryPoints: [resolve(__dirname, '../../../../../examples/plugin-hello-world/backend/plugin.ts')],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      metafile: true,
      external: ['@nestjs/*', '@attraccess/plugins-backend-sdk/v2'],
      tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    });
    const imports = Object.values(artifact.metafile.outputs).flatMap(({ imports }) => imports.map(({ path }) => path));
    expect(imports).toContain('@attraccess/plugins-backend-sdk/v2');
    expect(imports).not.toContain('typeorm');
    plugin = loadPluginEntryExports(outfile).default as PluginBackendModule;
    expect(plugin.persistence).toEqual({ contractVersion: 2, supportedBackends: ['sqlite'] });
    source = new DataSource({ ...dataSourceConfig, database: join(root, 'host.sqlite'), migrationsRun: true });
    await source.initialize();
  }, 30000);

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  async function start(userCount: number, canReadUsers = true): Promise<void> {
    await source.getRepository(User).clear();
    for (let index = 0; index < userCount; index++) {
      await source.getRepository(User).save({ username: `person-${index}`, email: `person-${index}@example.test` });
    }
    const unavailable = () => {
      throw new Error('Legacy persistence capability was invoked');
    };
    const base: LegacyPluginContext = {
      manifest: { name: 'hello-world', id: 'hello-world', version: '1.0.0', pluginDirectory: root },
      events: new EventEmitter2(),
      dataSource: source,
      logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
      mqtt: { subscribe: async () => ({ unsubscribe: jest.fn() }), publish: async () => undefined },
      getRepository: unavailable,
      get: unavailable,
      onEvent: () => ({ off: jest.fn() }),
      emitEvent: () => undefined,
      getMqttServerConfig: async () => null,
      getMqttCredentialProvisioning: unavailable,
      flows: { trigger: async () => undefined },
      secrets: { encrypt: unavailable, decrypt: unavailable },
    };
    const permissions: PluginPermission[] = [
      PluginPermission.LISTEN_EVENTS,
      PluginPermission.ACCESS_MQTT_SERVERS,
      PluginPermission.TRIGGER_FLOWS,
    ];
    if (canReadUsers) permissions.push(PluginPermission.READ_USERS);
    const legacyGuard = LegacyPluginSandbox.createGuardedContext(base, permissions);
    const context = createNeutralGuardedContext(
      legacyGuard,
      permissions,
      new SqlitePluginHostOperations(() => source),
      {
        resolve: unavailable,
      },
    );
    expect(context).not.toHaveProperty('dataSource');
    expect(context).not.toHaveProperty('getRepository');
    expect(context).not.toHaveProperty('get');
    const module = await Test.createTestingModule({ imports: [plugin.register(context)] }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false });
    await app.init();
  }

  it.each([0, 1, 6])('returns at most five greetings for %i users through the real SQLite reader', async (count) => {
    await start(count);
    const result = await request(app.getHttpServer()).get('/hello-world/greetings').expect(200);
    expect(result.body).toEqual({
      greetings: Array.from({ length: Math.min(count, 5) }, (_, index) => `Hello, person-${index}!`),
    });
  });

  it('denies user reads without READ_USERS and leaves user data unchanged', async () => {
    await start(1, false);
    await request(app.getHttpServer()).get('/hello-world/greetings').expect(500);
    expect(await source.getRepository(User).count()).toBe(1);
  });
});

describe('standalone neutral Shelly registry', () => {
  let root: string;
  let source: DataSource;
  let registry: {
    create(input: {
      name: string;
      ipAddress: string;
      generation: number | null;
      model: string | null;
      authState: 'unknown';
      lastProbeAt: null;
      lastProbeError: null;
    }): Promise<{ id: number; createdAt: string }>;
    list(): Promise<Array<{ id: number; name: string }>>;
    findById(id: number): Promise<{ authState: string; model: string | null } | null>;
    updateAuthState(id: number, state: 'required'): Promise<void>;
    delete(id: number): Promise<void>;
  };

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'attraccess-neutral-shelly-'));
    const options = {
      bundle: true,
      platform: 'node' as const,
      format: 'cjs' as const,
      external: [
        '@nestjs/*',
        '@attraccess/plugins-backend-sdk',
        '@attraccess/plugins-backend-sdk/v2',
        '@attraccess/plugins-backend-sdk/adapter',
        'typeorm',
        'reflect-metadata',
      ],
      tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    };
    const entry = join(root, 'plugin.cjs');
    const migrations = join(root, 'migrations.cjs');
    await build({
      ...options,
      entryPoints: [resolve(__dirname, '../../../../plugins/shelly/backend/plugin.ts')],
      outfile: entry,
    });
    await build({
      ...options,
      entryPoints: [resolve(__dirname, '../../../../plugins/shelly/backend/migrations.ts')],
      outfile: migrations,
    });
    const plugin = loadPluginEntryExports(entry).default as PluginBackendModule & PluginBackendAdapters;
    const registration = plugin.persistenceAdapters[0];
    expect(plugin.persistence).toEqual({ contractVersion: 2, supportedBackends: ['sqlite'] });
    source = await new DataSource({
      type: 'sqlite',
      database: join(root, 'shelly.sqlite'),
      entities: [...registration.entities],
      migrations: Object.values(loadPluginEntryExports(migrations)) as Array<new () => MigrationInterface>,
      synchronize: false,
    }).initialize();
    await source.runMigrations();
    const adapters = new SqlitePluginAdapters(registration, () => source);
    const context = { persistence: adapters.bind() } as unknown as NeutralPluginContext;
    const providers = plugin.register(context).providers;
    const Service = providers.find(
      (provider) => typeof provider === 'function' && provider.name === 'DeviceRegistryService',
    ) as new (context: NeutralPluginContext) => typeof registry;
    registry = new Service(context);
  }, 30000);

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('round-trips plain records through the released SQLite migration without raw context access', async () => {
    const input = {
      name: 'First',
      ipAddress: '192.0.2.10',
      generation: 2,
      model: 'fixture',
      authState: 'unknown' as const,
      lastProbeAt: null,
      lastProbeError: null,
    };
    const first = await registry.create(input);
    const second = await registry.create({ ...input, name: 'Second', ipAddress: '192.0.2.11' });
    expect(first.createdAt).toEqual(expect.any(String));
    expect(Object.getPrototypeOf(Object.getPrototypeOf(first))).toBeNull();
    expect((await registry.list()).map((row) => row.id)).toEqual([first.id, second.id]);
    await registry.updateAuthState(first.id, 'required');
    expect(await registry.findById(first.id)).toMatchObject({ model: 'fixture', authState: 'required' });
    await expect(registry.create(input)).rejects.toThrow();
    await registry.delete(first.id);
    expect(await registry.findById(first.id)).toBeNull();
  });
});
