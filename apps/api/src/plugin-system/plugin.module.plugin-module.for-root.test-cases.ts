import { dataSourceConfig } from '../database/datasource';
import 'reflect-metadata';

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PluginPermission } from '@attraccess/plugins-backend-sdk';
import { PluginModule } from './plugin.module';
import { PluginService } from './plugin.service';
import { PluginSandboxService } from './plugin-sandbox.service';
import { PluginEventsService } from './plugin-events.service';
import { PluginMqttService } from './plugin-mqtt.service';
import { PluginController } from './plugin.controller';
import { NpmPluginService } from './npm-plugin.service';
import { PluginClassificationService } from './plugin-classification.service';
import { SettingsModule } from '../settings/settings.module';
import { LiveTopicsModule } from '../live-updates/live-topics.module';
import { PluginLiveUpdatesService } from './plugin-live-updates.service';
import { MqttModule } from '../mqtt/mqtt.module';
import { MqttCredentialProvisioningService } from '../mqtt/mqtt-credential-provisioning.service';
import { registerPluginModuleFixture } from './plugin.module.plugin-module.test-fixture';
export function registerForRootCases(fixture: ReturnType<typeof registerPluginModuleFixture>) {
  describe('forRoot', () => {
    it.each([false, true])('registers unique declared entities only with database access: %s', (allowed) => {
      const registry = dataSourceConfig.entities as unknown[];
      const previous = [...registry];
      try {
        mkdirSync(join(fixture.root, 'entities/dist'), { recursive: true });
        writeFileSync(
          join(fixture.root, 'entities/plugin.json'),
          JSON.stringify({
            name: 'entities',
            version: '1.0.0',
            main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
            permissions: allowed ? [PluginPermission.DATABASE_ACCESS] : [],
            attraccessVersion: { min: '1.0.0' },
          }),
        );
        writeFileSync(
          join(fixture.root, 'entities/dist/index.js'),
          'class Widget {} class WidgetModule {} module.exports = { default: { entities: [Widget, Widget], register: () => ({ module: WidgetModule }) } };',
        );
        PluginModule.forRoot();
        expect(registry.length).toBe(previous.length + (allowed ? 1 : 0));
        if (allowed) expect((registry.at(-1) as { name: string }).name).toBe('Widget');
      } finally {
        registry.splice(0, registry.length, ...previous);
      }
    });

    it('exposes only the host providers and controller when plugins are disabled', () => {
      PluginModule.configure({ DISABLE_PLUGINS: true });
      const module = PluginModule.forRoot();
      expect(module.providers).toEqual([
        PluginService,
        PluginSandboxService,
        PluginEventsService,
        PluginMqttService,
        NpmPluginService,
        PluginClassificationService,
        PluginLiveUpdatesService,
      ]);
      expect(module.exports).toEqual([PluginEventsService]);
      expect(module.controllers).toEqual([PluginController]);
      expect(module.imports).toEqual([SettingsModule, MqttModule, LiveTopicsModule]);
    });

    it('builds an empty import list when no plugins are present', () => {
      const module = PluginModule.forRoot();
      expect(module.imports).toEqual([SettingsModule, MqttModule, LiveTopicsModule]);
      expect(module.controllers).toEqual([PluginController]);
    });

    it('isolates a failing plugin load without crashing the module', () => {
      mkdirSync(join(fixture.root, 'broken'), { recursive: true });
      writeFileSync(
        join(fixture.root, 'broken', 'plugin.json'),
        JSON.stringify({
          name: 'broken',
          version: '1.0.0',
          main: { backend: { directory: 'dist', entryPoint: 'missing.js' } },
          attraccessVersion: { min: '1.0.0' },
        }),
      );

      const discovered = PluginService.getPlugins();
      expect(discovered).toHaveLength(1);

      const module = PluginModule.forRoot();
      expect(module.imports).toEqual([SettingsModule, MqttModule, LiveTopicsModule]);
      expect(PluginService.getManifestById(discovered[0].id)).toBeDefined();
    });

    it('does not import a plugin persisted as quarantined after a previous failure', () => {
      mkdirSync(join(fixture.root, 'quarantined', 'dist'), { recursive: true });
      writeFileSync(
        join(fixture.root, 'quarantined', 'plugin.json'),
        JSON.stringify({
          name: 'quarantined',
          version: '1.0.0',
          main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
          attraccessVersion: { min: '1.0.0' },
        }),
      );
      writeFileSync(join(fixture.root, 'quarantined', 'dist', 'index.js'), 'throw new Error("must not be imported");');
      const [plugin] = PluginService.getPlugins();
      PluginService.quarantinePlugin(plugin, new Error('prior crash'));

      expect(PluginModule.forRoot().imports).toEqual([SettingsModule, MqttModule, LiveTopicsModule]);
      expect(PluginService.getPluginsWithLoadStatus()[0]).toMatchObject({ status: 'error', error: 'prior crash' });
    });

    it('does not register a credential provider from a plugin whose factory fails', () => {
      mkdirSync(join(fixture.root, 'broken-provider', 'dist'), { recursive: true });
      writeFileSync(
        join(fixture.root, 'broken-provider', 'plugin.json'),
        JSON.stringify({
          name: 'broken-provider',
          version: '1.0.0',
          main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
          attraccessVersion: { min: '1.0.0' },
        }),
      );
      writeFileSync(
        join(fixture.root, 'broken-provider', 'dist', 'index.js'),
        [
          'module.exports = {',
          "  default: { register: () => { throw new Error('register failed'); }, credentialProvisioningProvider: () => ({ id: 'orphan' }) }",
          '};',
        ].join('\n'),
      );
      const register = jest.spyOn(MqttCredentialProvisioningService, 'register');

      expect(PluginModule.forRoot().imports).toEqual([SettingsModule, MqttModule, LiveTopicsModule]);
      expect(register).not.toHaveBeenCalled();
    });

    it('loads a plugin whose externalized host-shared requires resolve to the host copy', () => {
      // The plugin dir lives under a tmp root outside the host node_modules tree
      // (mirroring production, where plugins sit under STORAGE_ROOT and the host
      // installs node_modules under dist/apps/api). Its index.js does a bare
      // require('@nestjs/common') — exactly what an externalized backend ships.
      // Without host-aware resolution this throws "Cannot find module".
      mkdirSync(join(fixture.root, 'needs-host-dep', 'dist'), { recursive: true });
      writeFileSync(
        join(fixture.root, 'needs-host-dep', 'plugin.json'),
        JSON.stringify({
          name: 'needs-host-dep',
          version: '1.0.0',
          main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
          attraccessVersion: { min: '1.0.0' },
        }),
      );
      writeFileSync(
        join(fixture.root, 'needs-host-dep', 'dist', 'index.js'),
        [
          "const nest = require('@nestjs/common');",
          'if (typeof nest.Module !== "function") { throw new Error("host @nestjs/common not resolved"); }',
          'class NeedsHostDepModule {}',
          'module.exports = { default: { register: () => ({ module: NeedsHostDepModule }) } };',
        ].join('\n'),
      );

      const module = PluginModule.forRoot();
      expect(module.imports).toEqual([SettingsModule, MqttModule, LiveTopicsModule, expect.any(Object)]);
    });
  });
}
