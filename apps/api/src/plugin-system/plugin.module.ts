import { DynamicModule, Global, Logger, Module, Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { PluginContext, PluginBackendModule } from '@attraccess/plugins-backend-sdk';
import { createRequire } from 'module';
import { LoadedPluginManifest } from './plugin.manifest';
import { PluginService } from './plugin.service';
import { PluginSandboxService } from './plugin-sandbox.service';
import { PluginController } from './plugin.controller';
import { join } from 'path';

@Global()
@Module({})
export class PluginModule {
  private static pluginManifests: LoadedPluginManifest[];
  private static logger = new Logger(PluginModule.name);
  private static DISABLE_PLUGINS_FLAG = false; // Default to false

  // Host singletons are only available once the DI container is live, which is
  // after forRoot() has already built the plugin modules. The context exposes
  // them through these holders, populated by the module constructor below.
  private static dataSourceRef: DataSource | null = null;
  private static eventsRef: EventEmitter2 | null = null;
  private static moduleRef: ModuleRef | null = null;

  constructor(dataSource: DataSource, events: EventEmitter2, moduleRef: ModuleRef) {
    PluginModule.dataSourceRef = dataSource;
    PluginModule.eventsRef = events;
    PluginModule.moduleRef = moduleRef;
  }

  public static configure(config: { DISABLE_PLUGINS: boolean }): void {
    PluginModule.DISABLE_PLUGINS_FLAG = config.DISABLE_PLUGINS;
    PluginModule.logger.log(`PluginModule configured. DisablePlugins: ${PluginModule.DISABLE_PLUGINS_FLAG}`);
  }


  public static forRoot(): DynamicModule {
    if (PluginModule.DISABLE_PLUGINS_FLAG) {
      PluginModule.logger.log('Plugins are disabled');

      return {
        module: PluginModule,
        providers: [PluginService, PluginSandboxService],
        controllers: [PluginController],
      };
    }

    this.pluginManifests = PluginService.getPlugins();

    const pluginModules = this.pluginManifests
      .map((manifest) => {
        try {
          const module = PluginModule.loadPluginModule(manifest);
          PluginService.markPluginAsLoaded(`${manifest.name}@${manifest.version}`);
          return module;
        } catch (error) {
          this.logger.error(`Error loading plugin ${manifest.name}`, error);
          PluginService.setPluginLoadError(`${manifest.name}@${manifest.version}`, error as Error);
          return null;
        }
      })
      .filter((module) => module !== null);

    return {
      module: PluginModule,
      providers: [PluginService, PluginSandboxService],
      imports: [...pluginModules],
      controllers: [PluginController],
    };
  }

  private static loadPluginModule(manifest: LoadedPluginManifest): DynamicModule {
    this.logger.log(`Loading plugin ${manifest.name} from ${manifest.main.backend.directory}`);

    if (!manifest.main.backend?.directory || !manifest.main.backend?.entryPoint) {
      this.logger.error(`Plugin ${manifest.name} has no backend, skipping backend module loading`);
      return null;
    }

    const pluginRequire = createRequire(__filename);
    const importedModule = pluginRequire(
      join(PluginService.PLUGIN_PATH, manifest.main.backend.directory, manifest.main.backend.entryPoint)
    );

    this.logger.log(`Imported module: ${manifest.name}`);

    const exported = importedModule.default as PluginBackendModule | DynamicModule;

    if (typeof (exported as PluginBackendModule)?.register !== 'function') {
      this.logger.warn(
        `Plugin ${manifest.name} does not export a register(context) factory; loading its default export as a static module.`
      );
      return exported as DynamicModule;
    }

    const context = PluginModule.createPluginContext(manifest);
    return (exported as PluginBackendModule).register(context);
  }

  private static createPluginContext(manifest: LoadedPluginManifest): PluginContext {
    const base: PluginContext = {
      manifest: PluginService.toManifestInfo(manifest),
      logger: new Logger(`Plugin:${manifest.name}`),
      get events(): EventEmitter2 {
        return PluginModule.requireRef(PluginModule.eventsRef, 'EventEmitter2');
      },
      get dataSource(): DataSource {
        return PluginModule.requireRef(PluginModule.dataSourceRef, 'DataSource');
      },
      getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> {
        return PluginModule.requireRef(PluginModule.dataSourceRef, 'DataSource').getRepository(entity);
      },
      get<T>(token: Type<T> | string | symbol): T {
        return PluginModule.requireRef(PluginModule.moduleRef, 'ModuleRef').get<T>(token, { strict: false });
      },
    };

    return PluginSandboxService.createGuardedContext(base, manifest.permissions ?? []);
  }

  private static requireRef<T>(ref: T | null, name: string): T {
    if (ref === null) {
      throw new Error(`Host ${name} is not available yet; the plugin context was accessed before bootstrap completed.`);
    }
    return ref;
  }
}
