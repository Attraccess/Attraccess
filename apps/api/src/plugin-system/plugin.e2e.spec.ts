import 'reflect-metadata';
import { Global, INestApplication, Module } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import {
  PluginContext,
  PluginPermission,
  PluginPermissionError,
} from '@attraccess/plugins-backend-sdk';
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { dirname, join, resolve } from 'path';
import request from 'supertest';
import { PluginService } from './plugin.service';
import { PluginModule } from './plugin.module';
import { LoadedPluginManifest } from './plugin.manifest';
import { zipFileUpload } from './__test__/make-zip';
import { MqttClientService } from '../mqtt/mqtt-client.service';
import { MqttServerService } from '../mqtt/servers/mqtt-server.service';

let hostDataSource: DataSource;

@Global()
@Module({
  providers: [
    { provide: DataSource, useFactory: () => hostDataSource },
    { provide: 'POC_HOST_GREETER', useValue: { greet: () => 'hello from host' } },
  ],
  exports: [DataSource, 'POC_HOST_GREETER'],
})
class HostModule {}

@Entity()
class PocNote {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  message!: string;
}

interface PocPongPayload {
  eventsInstanceMatch: boolean;
  dataSourceInstanceMatch: boolean;
  savedId: number;
  savedMessage: string;
  hostGreeting: string;
}

const PING_EVENT = 'poc.host.ping';
const PONG_EVENT = 'poc.plugin.pong';
const PLUGIN_NAME = 'poc-backend-plugin';
const ALL_PERMISSIONS = [
  PluginPermission.LISTEN_EVENTS,
  PluginPermission.EMIT_EVENTS,
  PluginPermission.DATABASE_ACCESS,
  PluginPermission.RESOLVE_HOST_PROVIDERS,
];

function findRepoRoot(start: string): string {
  let dir = start;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
  throw new Error('repo root (pnpm-workspace.yaml) not found');
}

const REPO_ROOT = findRepoRoot(__dirname);
const PLUGIN_ENTRY = resolve(REPO_ROOT, 'examples/poc-backend-plugin/src/index.ts');
const CACHE_DIR = join(REPO_ROOT, 'node_modules', '.cache', 'att-459-plugin-e2e');
const PLUGIN_PATH = join(CACHE_DIR, 'plugins');
const ARTIFACT = join(CACHE_DIR, 'index.js');

const SHARED = [
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/event-emitter',
  'eventemitter2',
  'typeorm',
  'reflect-metadata',
  '@attraccess/plugins-backend-sdk',
];

const PLUGIN_JSON = {
  name: PLUGIN_NAME,
  version: '1.0.0',
  main: {
    frontend: { directory: 'frontend', entryPoint: 'index.mjs' },
    backend: { directory: 'dist', entryPoint: 'index.js' },
  },
  attraccessVersion: { min: '1.0.0' },
  permissions: ALL_PERMISSIONS,
};

describe('Plugin system end-to-end (upload, load, endpoints, event round-trip, permission denial)', () => {
  let app: INestApplication;
  let events: EventEmitter2;
  let dataSource: DataSource;
  let restartSpy: jest.SpyInstance;

  beforeAll(async () => {
    rmSync(CACHE_DIR, { recursive: true, force: true });
    mkdirSync(PLUGIN_PATH, { recursive: true });
    await build({
      entryPoints: [PLUGIN_ENTRY],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'es2021',
      outfile: ARTIFACT,
      external: SHARED,
      tsconfigRaw: { compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true } },
      logLevel: 'silent',
    });

    restartSpy = jest
      .spyOn(PluginService.prototype as unknown as { restartApp: () => void }, 'restartApp')
      .mockImplementation(() => undefined);
    const realSetTimeout = global.setTimeout;
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: (...a: unknown[]) => void, delay?: number, ...rest: unknown[]) => {
      if (delay === 1000) return 0 as unknown as NodeJS.Timeout;
      return realSetTimeout(fn, delay as number, ...rest);
    }) as unknown as typeof setTimeout);

    PluginService.configure({ PLUGIN_DIR: PLUGIN_PATH, RESTART_BY_EXIT: true });

    const zip = zipFileUpload({
      'plugin.json': JSON.stringify(PLUGIN_JSON),
      'dist/index.js': readFileSync(ARTIFACT),
      'frontend/index.mjs': 'export default {};',
    });
    await new PluginService().uploadPlugin(zip);

    PluginService.configure({ PLUGIN_DIR: PLUGIN_PATH, RESTART_BY_EXIT: true });
    PluginModule.configure({ DISABLE_PLUGINS: false });

    dataSource = new DataSource({ type: 'sqlite', database: ':memory:', synchronize: true, entities: [PocNote] });
    await dataSource.initialize();
    hostDataSource = dataSource;
    events = new EventEmitter2();

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), HostModule, PluginModule.forRoot()],
    })
      .overrideProvider(EventEmitter2)
      .useValue(events)
      .overrideProvider(MqttClientService)
      .useValue({ subscribe: jest.fn(), unsubscribe: jest.fn(), publish: jest.fn() })
      .overrideProvider(MqttServerService)
      .useValue({ findOne: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  }, 120000);

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    jest.restoreAllMocks();
    rmSync(CACHE_DIR, { recursive: true, force: true });
  });

  it('discovers the uploaded fixture plugin on disk', () => {
    const plugin = PluginService.getManifestById(PluginService.getPlugins()[0].id);
    expect(plugin?.name).toBe(PLUGIN_NAME);
    expect(existsSync(join(PLUGIN_PATH, PLUGIN_NAME, 'dist', 'index.js'))).toBe(true);
  });

  it('serves the loaded plugin through the GET /plugins endpoint', async () => {
    const response = await request(app.getHttpServer()).get('/plugins');
    expect(response.status).toBe(200);
    const names = (response.body as LoadedPluginManifest[]).map((p) => p.name);
    expect(names).toContain(PLUGIN_NAME);
    const loaded = (response.body as LoadedPluginManifest[]).find((p) => p.name === PLUGIN_NAME);
    expect(loaded?.permissions).toEqual(expect.arrayContaining(ALL_PERMISSIONS));
  });

  it('round-trips an event through the loaded plugin and the shared host bus', async () => {
    const pong = new Promise<PocPongPayload>((res) => events.once(PONG_EVENT, res));
    events.emit(PING_EVENT, 'hello');
    const payload = await pong;

    expect(payload.dataSourceInstanceMatch).toBe(true);
    expect(payload.savedId).toBeGreaterThan(0);
    expect(payload.savedMessage).toBe(`${PLUGIN_NAME}:hello`);
    expect(payload.hostGreeting).toBe('hello from host');
  });

  it('enforces a permission denial when the manifest omits a capability', () => {
    const manifest = {
      id: 'denied',
      name: PLUGIN_NAME,
      version: '1.0.0',
      pluginDirectory: PLUGIN_NAME,
      permissions: [PluginPermission.LISTEN_EVENTS],
      main: PLUGIN_JSON.main,
      attraccessVersion: { min: '1.0.0' },
    } as unknown as LoadedPluginManifest;

    const ctx = (
      PluginModule as unknown as { createPluginContext(m: LoadedPluginManifest): PluginContext }
    ).createPluginContext(manifest);

    expect(() => ctx.dataSource).toThrow(PluginPermissionError);
    expect(() => ctx.dataSource).toThrow(/DATABASE_ACCESS/);
  });

  it('deletes the plugin and removes it from disk', async () => {
    const plugin = PluginService.getPlugins().find((p) => p.name === PLUGIN_NAME);
    expect(plugin).toBeDefined();

    await new PluginService().deletePlugin((plugin as LoadedPluginManifest).id);

    expect(existsSync(join(PLUGIN_PATH, PLUGIN_NAME))).toBe(false);
    expect(restartSpy).toHaveBeenCalledTimes(0);
  });
});
