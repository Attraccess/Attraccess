// Regression test for ATT-496: the Shelly plugin's REST controller must actually
// mount into the host API. After the plugin loaded successfully, POST
// /api/shelly/devices still 404'd — so this proves a plugin-supplied
// @Controller (returned from register()'s DynamicModule) is reachable end to end.
//
// We build the real apps/plugins/shelly backend, upload it through the same
// PluginService path production uses, boot a host Nest app, and assert the route
// is mounted. We do not authenticate: an unauthenticated request to a *mounted*
// route is rejected by the @Auth guard (401/403) or errors (500) — anything but
// 404. A 404 means the controller never mounted, which is the bug.
import 'reflect-metadata';
import { Global, INestApplication, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { dirname, join, resolve } from 'path';
import request from 'supertest';
import { PluginService } from './plugin.service';
import { PluginModule } from './plugin.module';
import { MqttClientService } from '../mqtt/mqtt-client.service';
import { MqttServerService } from '../mqtt/servers/mqtt-server.service';

let hostDataSource: DataSource;

@Global()
@Module({
  providers: [{ provide: DataSource, useFactory: () => hostDataSource }],
  exports: [DataSource],
})
class HostModule {}

const PLUGIN_NAME = 'shelly';

function findRepoRoot(start: string): string {
  let dir = start;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
  throw new Error('repo root (pnpm-workspace.yaml) not found');
}

const REPO_ROOT = findRepoRoot(__dirname);
const PLUGIN_SRC = resolve(REPO_ROOT, 'apps/plugins/shelly/backend/plugin.ts');
const CACHE_DIR = join(REPO_ROOT, 'node_modules', '.cache', 'att-496-shelly-routes');
const PLUGIN_PATH = join(CACHE_DIR, 'plugins');
const ARTIFACT = join(CACHE_DIR, 'index.js');

// Mirror apps/plugins/scripts/esbuild-backend.mjs HOST_SHARED_EXTERNALS so the
// artifact bare-requires the host-shared packages exactly like the shipped one.
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
  version: '0.1.0',
  main: {
    frontend: { directory: 'frontend', entryPoint: 'index.mjs' },
    backend: { directory: 'dist', entryPoint: 'index.js' },
  },
  attraccessVersion: { min: '1.0.0' },
  // No DATABASE_ACCESS needed: the controller mounts and the registry service
  // resolves its repository lazily (on first query), so nothing touches the DB
  // during the route-mount assertion below.
  permissions: [],
};

describe('Shelly plugin REST controller mounts into the host API', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    rmSync(CACHE_DIR, { recursive: true, force: true });
    mkdirSync(PLUGIN_PATH, { recursive: true });

    await build({
      entryPoints: [PLUGIN_SRC],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'es2021',
      outfile: ARTIFACT,
      external: SHARED,
      tsconfigRaw: { compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true } },
      logLevel: 'silent',
    });

    jest
      .spyOn(PluginService.prototype as unknown as { restartApp: () => void }, 'restartApp')
      .mockImplementation(() => undefined);
    // The upload path schedules a 1s restart timer that calls process.exit();
    // no-op only that timer so the test process is not killed mid-run.
    const realSetTimeout = global.setTimeout;
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(((fn: (...a: unknown[]) => void, delay?: number, ...rest: unknown[]) => {
        if (delay === 1000) return 0 as unknown as NodeJS.Timeout;
        return realSetTimeout(fn, delay as number, ...rest);
      }) as unknown as typeof setTimeout);

    PluginService.configure({ PLUGIN_DIR: PLUGIN_PATH, RESTART_BY_EXIT: true });

    const { zipFileUpload } = await import('./__test__/make-zip');
    const zip = zipFileUpload({
      'plugin.json': JSON.stringify(PLUGIN_JSON),
      'dist/index.js': readFileSync(ARTIFACT),
      'frontend/index.mjs': 'export default {};',
    });
    await new PluginService().uploadPlugin(zip);

    PluginService.configure({ PLUGIN_DIR: PLUGIN_PATH, RESTART_BY_EXIT: true });
    PluginModule.configure({ DISABLE_PLUGINS: false });

    dataSource = new DataSource({ type: 'sqlite', database: ':memory:', synchronize: true, entities: [] });
    await dataSource.initialize();
    hostDataSource = dataSource;

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), HostModule, PluginModule.forRoot()],
    })
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

  it('loads the shelly plugin without a backend load error', () => {
    const loaded = PluginService.getPluginsWithLoadStatus().find((p) => p.name === PLUGIN_NAME);
    expect(loaded).toBeDefined();
    expect((loaded as { loadStatus?: { state?: string } }).loadStatus?.state).not.toBe('error');
  });

  it('mounts GET /shelly/devices (not 404)', async () => {
    const res = await request(app.getHttpServer()).get('/shelly/devices');
    expect(res.status).not.toBe(404);
  });

  it('mounts POST /shelly/devices (not 404)', async () => {
    const res = await request(app.getHttpServer()).post('/shelly/devices').send({ ipAddress: '10.0.0.1' });
    expect(res.status).not.toBe(404);
  });
});
