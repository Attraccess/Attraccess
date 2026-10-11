import 'reflect-metadata';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { DynamicModule, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { AppController } from '../app/app.controller';
import { AppService } from '../app/app.service';
import { PluginModule } from './plugin.module';
import { PluginService } from './plugin.service';
import { NpmPluginService } from './npm-plugin.service';
import { setupNpmPluginFixture, ServiceInternals } from './npm-plugin.test-fixture';
import { PluginMqttService } from './plugin-mqtt.service';
import { PluginLiveUpdatesService } from './plugin-live-updates.service';

type Installer = ServiceInternals & {
  installFromRegistry(
    name: string,
    version: string,
    registry: { id: string; name: string; url: string },
  ): Promise<unknown>;
};

describe('extracted Matter package host isolation', () => {
  const fixture = setupNpmPluginFixture();
  const apps: INestApplication[] = [];
  beforeAll(() => {
    execFileSync(process.execPath, ['apps/plugins/matter/build.mjs'], { cwd: resolve('.') });
  });
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function coreAndPlugins() {
    const loaded = PluginModule.forRoot();
    expect(loaded.controllers).toBeDefined();
    const pluginImports = (loaded.imports ?? []).filter((entry): entry is DynamicModule =>
      Boolean(entry && typeof entry === 'object' && 'module' in entry),
    );
    const module = await Test.createTestingModule({
      imports: pluginImports,
      controllers: [AppController],
      // The backend-only packages do not use MQTT or live updates. Supply the
      // host cleanup stores without starting their unrelated infrastructure.
      providers: [
        AppService,
        { provide: PluginMqttService, useValue: { clearPlugin: jest.fn() } },
        { provide: PluginLiveUpdatesService, useValue: { clearPlugin: jest.fn() } },
      ],
    }).compile();
    const app = module.createNestApplication();
    apps.push(app);
    app.setGlobalPrefix('api');
    await app.init();
    new PluginModule({} as never, new EventEmitter2(), module.get(ModuleRef));
    return app;
  }

  async function available(app: INestApplication) {
    await request(app.getHttpServer()).get('/api/info').expect(200).expect({ name: 'Attraccess API', status: 'ok' });
    await request(app.getHttpServer()).get('/api/unrelated-probe').expect(200).expect({ available: true });
  }

  it.each([true, false])(
    'keeps core and an unrelated plugin available with supported host: %s',
    async (compatible) => {
      PluginModule.configure({ DISABLE_PLUGINS: false });
      const unrelated = join(fixture.root, 'unrelated');
      mkdirSync(join(unrelated, 'dist'), { recursive: true });
      writeFileSync(
        join(unrelated, 'plugin.json'),
        JSON.stringify({
          name: 'unrelated',
          version: '1.0.0',
          permissions: [],
          attraccessVersion: { min: '1.0.0' },
          main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        }),
      );
      writeFileSync(
        join(unrelated, 'dist/index.js'),
        [
          "const { Controller, Get, Module } = require('@nestjs/common');",
          'class Probe { get() { return { available: true }; } }',
          "Controller('unrelated-probe')(Probe);",
          "Get()(Probe.prototype, 'get', Object.getOwnPropertyDescriptor(Probe.prototype, 'get'));",
          'class UnrelatedPluginModule {}',
          'Module({ controllers: [Probe] })(UnrelatedPluginModule);',
          'module.exports = { default: { register: () => ({ module: UnrelatedPluginModule }) } };',
        ].join('\n'),
      );
      const before = await coreAndPlugins();
      await available(before);

      // Pack the real built plugin. The host installer verifies integrity and
      // extracts this tarball itself; only registry transport and host version are simulated.
      const packageDir = resolve('apps/plugins/matter/package');
      const packed = JSON.parse(
        execFileSync('npm', ['pack', '--json', '--pack-destination', fixture.root], {
          cwd: packageDir,
          encoding: 'utf8',
        }),
      )[0];
      const archive = join(fixture.root, packed.filename);
      const tarball = readFileSync(archive);
      rmSync(archive);
      const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
      const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
      const installer = service as unknown as Installer;
      jest.spyOn(installer, 'hostVersion').mockReturnValue(compatible ? pkg.attraccess.host : '999.0.0');
      jest.spyOn(service, 'packageMetadata').mockResolvedValue({
        versions: {
          [pkg.version]: {
            version: pkg.version,
            dist: { tarball: 'matter-fixture', shasum: createHash('sha1').update(tarball).digest('hex') },
          },
        },
      });
      jest.spyOn(installer, 'download').mockResolvedValue(tarball);
      const installation = installer.installFromRegistry(pkg.name, pkg.version, {
        id: 'fixture',
        name: 'Fixture',
        url: 'https://registry.example',
      });
      if (compatible) await installation;
      else await expect(installation).rejects.toThrow('Plugin is not compatible with Attraccess 999.0.0');
      await available(before);
      // Installation takes effect on the next host boot. Re-scan the persisted
      // package state as that boot does, rather than reusing discovery's cache.
      PluginService.configure({ PLUGIN_DIR: fixture.root, RESTART_BY_EXIT: true });
      await available(await coreAndPlugins());
      const statuses = PluginService.getPluginsWithLoadStatus();
      expect(statuses.find((plugin) => plugin.name === 'unrelated')?.status).toBe('loaded');
      expect(statuses.find((plugin) => plugin.name === pkg.name)?.status).toBe(compatible ? 'loaded' : undefined);
    },
    30000,
  );
});
