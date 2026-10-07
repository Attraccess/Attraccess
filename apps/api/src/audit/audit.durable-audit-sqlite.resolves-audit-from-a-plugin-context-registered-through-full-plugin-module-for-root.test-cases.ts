import { PluginModule } from '../plugin-system/plugin.module';
import { PluginService } from '../plugin-system/plugin.service';
import { PluginSandboxService } from '../plugin-system/plugin-sandbox.service';
import { PluginEventsService } from '../plugin-system/plugin-events.service';
import { PluginMqttService } from '../plugin-system/plugin-mqtt.service';
import { NpmPluginService } from '../plugin-system/npm-plugin.service';
import { PluginClassificationService } from '../plugin-system/plugin-classification.service';
import { MqttModule } from '../mqtt/mqtt.module';
import * as pluginLoader from '../plugin-system/plugin-loader';
import { PluginContext } from '@attraccess/plugins-backend-sdk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { AuditModule } from './audit.module';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsModule } from '../settings/settings.module';
import { Module } from '@nestjs/common';
import { resetPluginAuditRegistry } from '../plugin-system/plugin-audit-registry';
import { registerDurableAuditSqliteFixture } from './audit.durable-audit-sqlite.test-fixture';
export function registerResolvesAuditFromAPluginContextRegisteredThroughFullPluginModuleForRootCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('resolves audit from a plugin context registered through full PluginModule.forRoot', async () => {
    let context: PluginContext;
    @Module({})
    class FixturePlugin {}
    @Module({
      providers: [{ provide: SettingsStoreService, useValue: fixture.store }],
      exports: [SettingsStoreService],
    })
    class FixtureSettingsModule {}
    @Module({})
    class FixtureMqttModule {}
    const originalPluginPath = PluginService.PLUGIN_PATH;
    PluginService.PLUGIN_PATH = fixture.directory;
    const quarantine = jest.spyOn(PluginService, 'quarantinePlugin').mockImplementation(() => undefined);
    const manifests = jest.spyOn(PluginService, 'getPlugins').mockReturnValue([
      {
        id: fixture.event().pluginId,
        name: 'audit-fixture',
        version: '1.0.0',
        pluginDirectory: fixture.directory,
        main: { backend: { directory: fixture.directory, entryPoint: 'fixture.js' } },
        permissions: [],
      } as never,
    ]);
    const quarantined = jest.spyOn(PluginService, 'isPluginQuarantined').mockReturnValue(false);
    const markLoaded = jest.spyOn(PluginService, 'markPluginAsLoaded').mockImplementation(() => undefined);
    // The host registers plugin-declared audit domains during forRoot; drop the
    // beforeEach registration so this exercises the real PluginModule wiring.
    resetPluginAuditRegistry();
    const loader = jest.spyOn(pluginLoader, 'loadPluginEntryExports').mockReturnValue({
      default: {
        auditDomains: [fixture.demoDomain],
        register: (value: PluginContext) => {
          context = value;
          return { module: FixturePlugin };
        },
      },
    });
    try {
      const builder = Test.createTestingModule({ imports: [AuditModule, PluginModule.forRoot()] })
        .overrideModule(SettingsModule)
        .useModule(FixtureSettingsModule)
        .overrideModule(MqttModule)
        .useModule(FixtureMqttModule);
      for (const provider of [
        PluginService,
        PluginSandboxService,
        PluginEventsService,
        PluginMqttService,
        NpmPluginService,
        PluginClassificationService,
      ]) {
        builder.overrideProvider(provider).useValue({ clearPlugin: jest.fn() });
      }
      const module = await builder
        .useMocker((token) => {
          if (token === DataSource) return fixture.source;
          if (token === EventEmitter2) return new EventEmitter2();
          return {};
        })
        .compile();
      try {
        await module.init();
        expect(context).toBeDefined();
        expect(await context.audit.record(fixture.event())).toEqual({ status: 'recorded' });
        expect((await module.get(AuditService).list({ limit: 1 })).items[0].pluginId).toBe(fixture.event().pluginId);
      } finally {
        await module.close();
      }
    } finally {
      PluginService.PLUGIN_PATH = originalPluginPath;
      quarantine.mockRestore();
      loader.mockRestore();
      manifests.mockRestore();
      quarantined.mockRestore();
      markLoaded.mockRestore();
    }
  });
}
