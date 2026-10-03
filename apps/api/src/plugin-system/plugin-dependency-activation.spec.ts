import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Test } from '@nestjs/testing';
import { PluginModule } from './plugin.module';
import { PluginService } from './plugin.service';
import { PluginMigrationService } from './plugin-migration.service';

describe('plugin dependency activation', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'plugin-activation-'));
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    PluginModule.configure({ DISABLE_PLUGINS: false });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });
  const fixture = (name: string, dependencies: string[] = [], fail = false, migrations = false) => {
    mkdirSync(join(root, name, 'dist'), { recursive: true });
    writeFileSync(
      join(root, name, 'plugin.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        attraccessVersion: { min: '1.0.0' },
        dependencies: dependencies.map((name) => ({ name, version: '^1.0.0', required: true })),
        main: {
          backend: { directory: 'dist', entryPoint: 'index.js' },
          ...(migrations ? { migrations: { directory: 'dist', entryPoint: 'migrations.js' } } : {}),
        },
      }),
    );
    writeFileSync(
      join(root, name, 'dist', 'index.js'),
      `require('fs').appendFileSync(${JSON.stringify(join(root, '.load-order'))}, ${JSON.stringify(name + '\n')}); ${fail ? "throw new Error('core crashed');" : `module.exports = { default: { register: () => ({ module: class TestModule {}, providers: [{ provide: 'lifecycle-${name}', useValue: { onModuleInit: () => require('fs').appendFileSync(${JSON.stringify(join(root, '.init-order'))}, ${JSON.stringify(name + '\n')}) } }] }) } };`}`,
    );
  };
  it('loads required backends before their dependants even when discovery returns the opposite order', () => {
    fixture('a-provider', ['z-core']);
    fixture('z-core');
    PluginModule.forRoot();
    expect(readFileSync(join(root, '.load-order'), 'utf8')).toBe('z-core\na-provider\n');
    expect(PluginService.getPluginsWithLoadStatus().every(({ status }) => status === 'loaded')).toBe(true);
  });
  it('initializes Nest dependency modules before dependant lifecycle hooks', async () => {
    fixture('a-provider', ['z-core']);
    fixture('z-core');
    const plugins = PluginModule.forRoot();
    const builder = Test.createTestingModule({ imports: plugins.imports.slice(2) });
    for (const plugin of PluginService.getPlugins())
      builder.overrideProvider(`plugin-mqtt-cleanup:${plugin.id}`).useValue({ onModuleDestroy: () => undefined });
    const app = await builder.compile();
    try {
      await app.init();
      expect(readFileSync(join(root, '.init-order'), 'utf8')).toBe('z-core\na-provider\n');
    } finally {
      await app.close();
    }
  });

  it('keeps dependants inactive and explains the dependency failure while unrelated plugins load', () => {
    fixture('a-provider', ['z-core']);
    fixture('z-core', [], true);
    fixture('independent');
    PluginModule.forRoot();
    expect(readFileSync(join(root, '.load-order'), 'utf8')).not.toContain('a-provider');
    const statuses = PluginService.getPluginsWithLoadStatus();
    expect(statuses.find(({ name }) => name === 'a-provider')).toMatchObject({
      status: 'error',
      error: expect.stringContaining('z-core failed to load'),
    });
    expect(statuses.find(({ name }) => name === 'independent').status).toBe('loaded');
    expect(PluginService.isPluginQuarantined(statuses.find(({ name }) => name === 'a-provider'))).toBe(false);
  });
  it('runs dependency migrations first and skips dependants after a failed migration', async () => {
    fixture('a-provider', ['z-core'], false, true);
    fixture('z-core', [], false, true);
    fixture('independent', [], false, true);
    const migrated: string[] = [];
    jest.spyOn(PluginMigrationService, 'runUpMigrations').mockImplementation(async (manifest) => {
      migrated.push(manifest.name);
      if (manifest.name === 'z-core') throw new Error('schema failed');
      return 1;
    });
    await PluginMigrationService.runPendingUpMigrationsForAllPlugins();
    expect(migrated).toEqual(['z-core', 'independent']);
    PluginModule.forRoot();
    expect(PluginService.getPluginsWithLoadStatus().find(({ name }) => name === 'a-provider')).toMatchObject({
      status: 'error',
      error: expect.stringContaining('z-core failed migrations'),
    });
  });
});
