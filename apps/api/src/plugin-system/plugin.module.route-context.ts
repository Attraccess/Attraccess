import type { PluginModule } from './plugin.module';
import { PluginContext, PluginEntityClass } from '@attraccess/plugins-backend-sdk';
import { DynamicModule, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource as HostDataSource } from 'typeorm';
import { PluginEventsService } from './plugin-events.service';
import { PluginMqttService } from './plugin-mqtt.service';
import { LoadedPluginManifest } from './plugin.manifest';

function getImplementationClass(): typeof PluginModule {
  return require('./plugin.module').PluginModule;
}

export abstract class PluginModuleRouteContext {
  protected static DISABLE_PLUGINS_FLAG = false;
  protected static logger = new Logger('PluginModule');
  protected static pluginManifests: LoadedPluginManifest[];
  declare protected static loadPluginModule: (manifest: LoadedPluginManifest) => DynamicModule;
  declare protected static registerPluginEntities: (
    manifest: LoadedPluginManifest,
    entities: PluginEntityClass[] | undefined,
  ) => void;
  declare protected static createPluginContext: (manifest: LoadedPluginManifest) => PluginContext;
  protected static moduleRef: ModuleRef | null = null;
  protected static eventsRef: EventEmitter2 | null = null;
  protected static dataSourceRef: HostDataSource | null = null;

  /** Discard host instances when the temporary configuration app is closed. */
  public static resetHostReferences(): void {
    getImplementationClass().dataSourceRef = null;
    getImplementationClass().eventsRef = null;
    getImplementationClass().moduleRef = null;
  }

  public static configure(config: { DISABLE_PLUGINS: boolean }): void {
    getImplementationClass().DISABLE_PLUGINS_FLAG = config.DISABLE_PLUGINS;
    getImplementationClass().logger.log(
      `PluginModule configured. DisablePlugins: ${getImplementationClass().DISABLE_PLUGINS_FLAG}`,
    );
  }

  public static arePluginsDisabled(): boolean {
    return getImplementationClass().DISABLE_PLUGINS_FLAG;
  }

  protected static pluginEvents(): PluginEventsService {
    return getImplementationClass()
      .requireRef(getImplementationClass().moduleRef, 'ModuleRef')
      .get(PluginEventsService, { strict: false });
  }

  protected static pluginMqtt(): PluginMqttService {
    return getImplementationClass()
      .requireRef(getImplementationClass().moduleRef, 'ModuleRef')
      .get(PluginMqttService, { strict: false });
  }

  protected static requireRef<T>(ref: T | null, name: string): T {
    if (ref === null) {
      throw new Error(`Host ${name} is not available yet; the plugin context was accessed before bootstrap completed.`);
    }
    return ref;
  }
}
