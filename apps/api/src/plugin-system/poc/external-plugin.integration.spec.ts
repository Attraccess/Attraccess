import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { ModuleRef } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Column, DataSource, Entity, EntityTarget, ObjectLiteral, PrimaryGeneratedColumn, Repository } from 'typeorm';
import { PluginContext, SystemEvent, SystemEventHandler, SystemEventPayload } from '@attraccess/plugins-backend-sdk';
import { PluginEventsService } from '../plugin-events.service';
import { build } from 'esbuild';
import { createRequire } from 'module';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, join, resolve } from 'path';

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

interface PluginBackendModule {
  register(context: PluginContext): import('@nestjs/common').DynamicModule;
}

const PONG_EVENT = 'poc.plugin.pong';
const PING_EVENT = 'poc.host.ping';

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
const BUILD_DIR = join(REPO_ROOT, 'node_modules', '.cache', 'att-454-poc-plugin');

const SHARED = ['@nestjs/common', '@nestjs/core', '@nestjs/event-emitter', 'eventemitter2', 'typeorm', 'reflect-metadata', '@attraccess/plugins-backend-sdk'];
const BAD_EXTERNALS = SHARED.filter((dep) => dep !== '@nestjs/event-emitter' && dep !== 'eventemitter2');

async function buildArtifact(outfile: string, external: string[]): Promise<void> {
  await build({
    entryPoints: [PLUGIN_ENTRY],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'es2021',
    outfile,
    external,
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true } },
    logLevel: 'silent',
  });
}

function loadDefaultExport(artifactPath: string): PluginBackendModule {
  const pluginRequire = createRequire(__filename);
  return pluginRequire(artifactPath).default as PluginBackendModule;
}

async function bootAndPing(artifactPath: string): Promise<PocPongPayload> {
  const dataSource = new DataSource({ type: 'sqlite', database: ':memory:', synchronize: true, entities: [PocNote] });
  await dataSource.initialize();

  const events = new EventEmitter2();
  const moduleRefHolder: { ref: ModuleRef | null } = { ref: null };

  const pluginEvents = new PluginEventsService(events);
  const context: PluginContext = {
    manifest: { id: 'poc', name: 'poc-backend-plugin', version: '1.0.0', pluginDirectory: 'poc-backend-plugin' },
    events,
    dataSource,
    logger: new Logger('poc-backend-plugin'),
    mqtt: {
      subscribe: () => ({ unsubscribe: () => undefined }),
      publish: () => Promise.resolve(),
    },
    getRepository: <T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> => dataSource.getRepository(entity),
    get: <T>(token: import('@nestjs/common').Type<T> | string | symbol): T => {
      if (!moduleRefHolder.ref) throw new Error('host ModuleRef not ready');
      return moduleRefHolder.ref.get(token, { strict: false });
    },
    onEvent<E extends SystemEvent>(event: E, handler: SystemEventHandler<E>) {
      return pluginEvents.onEvent(event, handler);
    },
    emitEvent<E extends SystemEvent>(event: E, payload: SystemEventPayload[E]) {
      pluginEvents.emit(event, payload);
    },
    getMqttServerConfig: () => Promise.resolve(null),
    getMqttCredentialProvisioning: () => ({
      availableProviders: async () => [],
      provision: async () => ({}),
      revoke: async () => undefined,
    }),
    flows: { trigger: async () => undefined },
    secrets: {
      encrypt: (value) => `encrypted:${value}`,
      decrypt: (value) => value.replace('encrypted:', ''),
    },
  };

  const plugin = loadDefaultExport(artifactPath);
  const app: TestingModule = await Test.createTestingModule({
    imports: [EventEmitterModule.forRoot(), plugin.register(context)],
    providers: [{ provide: 'POC_HOST_GREETER', useValue: { greet: () => 'hello from host' } }],
  })
    .overrideProvider(EventEmitter2)
    .useValue(events)
    .compile();

  moduleRefHolder.ref = app.get(ModuleRef);
  await app.init();

  const pong = new Promise<PocPongPayload>((res) => events.once(PONG_EVENT, res));
  events.emit(PING_EVENT, 'hello');
  const payload = await pong;

  await app.close();
  await dataSource.destroy();
  return payload;
}

describe('Backend plugin PoC — separately-built plugin loaded via createRequire (ATT-454)', () => {
  const goodArtifact = join(BUILD_DIR, 'good.js');
  const badArtifact = join(BUILD_DIR, 'bad.js');

  beforeAll(async () => {
    rmSync(BUILD_DIR, { recursive: true, force: true });
    mkdirSync(BUILD_DIR, { recursive: true });
    await buildArtifact(goodArtifact, SHARED);
    await buildArtifact(badArtifact, BAD_EXTERNALS);
  }, 120000);

  afterAll(() => {
    rmSync(BUILD_DIR, { recursive: true, force: true });
  });

  it('externalized build: shares host EventEmitter2 + DataSource and round-trips through the host', async () => {
    const payload = await bootAndPing(goodArtifact);

    expect(payload.eventsInstanceMatch).toBe(true);
    expect(payload.dataSourceInstanceMatch).toBe(true);
    expect(payload.savedId).toBeGreaterThan(0);
    expect(payload.savedMessage).toBe('poc-backend-plugin:hello');
    expect(payload.hostGreeting).toBe('hello from host');
  }, 60000);

  it('mis-bundled build: loses EventEmitter2 token identity while the host-owned DataSource still matches', async () => {
    const payload = await bootAndPing(badArtifact);

    expect(payload.eventsInstanceMatch).toBe(false);
    expect(payload.dataSourceInstanceMatch).toBe(true);
    expect(payload.savedId).toBeGreaterThan(0);
    expect(payload.hostGreeting).toBe('hello from host');
  }, 60000);
});
