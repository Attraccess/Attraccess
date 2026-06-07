import { DynamicModule, Global, Logger, Module, Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import {
  PluginContext,
  PluginBackendModule,
  SystemEvent,
  SystemEventHandler,
  SystemEventPayload,
  SystemEventSubscription,
} from '@attraccess/plugins-backend-sdk';
import { createRequire, Module as NodeModuleClass } from 'module';
import { readFileSync } from 'fs';
import { runInThisContext } from 'vm';
import { LoadedPluginManifest } from './plugin.manifest';
import { PluginService } from './plugin.service';
import { PluginSandboxService } from './plugin-sandbox.service';
import { PluginEventsService } from './plugin-events.service';
import { PluginController } from './plugin.controller';
import { dirname, isAbsolute, join } from 'path';

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
        providers: [PluginService, PluginSandboxService, PluginEventsService],
        exports: [PluginEventsService],
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
      providers: [PluginService, PluginSandboxService, PluginEventsService],
      exports: [PluginEventsService],
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

    const importedModule = PluginModule.loadPluginExports(
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

  // Loads a plugin's CommonJS backend entry so that its *externalized*
  // host-shared packages (@nestjs/common, typeorm, reflect-metadata, …) resolve
  // to the host's single copy. Plugins deliberately do not bundle those packages
  // — a bundled copy is a different class/symbol object and breaks DI token
  // identity and constructor-metadata reflection (see
  // docs/en/plugins/developing-plugins.md "Packaging the backend"). The shipped
  // index.js therefore does a bare `require('@nestjs/common')` at runtime.
  //
  // Two failure modes have to be avoided at once:
  //   1. Resolution — in a production image the plugin lives under
  //      STORAGE_ROOT/plugins/… while the host's node_modules sits under
  //      dist/apps/api/, so a bare require resolved relative to the plugin's own
  //      directory finds nothing ("Cannot find module '@nestjs/common'").
  //   2. Identity — the loaded module must be the very same object the host uses,
  //      AND the plugin's decorators must run against the same global `Reflect`
  //      the host reads. Handing the entry to Node's own loader (`new Module().
  //      load()`) compiles it in a separate realm: its `__decorate`/`Reflect.
  //      metadata` writes land on a different `Reflect`/metadata registry, so DI
  //      sees no constructor dependencies and injections come back undefined.
  //
  // We satisfy both by compiling the entry in *this* realm with `vm.
  // runInThisContext` (so decorator metadata is written to the same `Reflect`
  // the host reads) and handing it a `require` that routes every *bare*
  // specifier — i.e. the externalized host-shared packages — to the host's own
  // require, returning the host's already-loaded instances regardless of where
  // the plugin lives on disk. Relative/absolute requests stay plugin-local.
  private static loadPluginExports(entryFile: string): { default?: unknown } {
    const NodeModule = NodeModuleClass as unknown as {
      wrap(script: string): string;
      _nodeModulePaths(from: string): string[];
      new (id: string, parent?: unknown): {
        filename: string;
        paths: string[];
        exports: { default?: unknown };
        require(request: string): unknown;
      };
    };

    const hostRequire = createRequire(__filename);
    const isBareSpecifier = (request: string): boolean => !request.startsWith('.') && !isAbsolute(request);

    const pluginModule = new NodeModule(entryFile, module);
    pluginModule.filename = entryFile;
    pluginModule.paths = NodeModule._nodeModulePaths(dirname(entryFile));

    const pluginRequire = ((request: string): unknown =>
      isBareSpecifier(request) ? hostRequire(request) : pluginModule.require(request)) as NodeJS.Require;
    pluginRequire.resolve = hostRequire.resolve;

    const compiled = runInThisContext(NodeModule.wrap(readFileSync(entryFile, 'utf8')), { filename: entryFile });
    compiled.call(
      pluginModule.exports,
      pluginModule.exports,
      pluginRequire,
      pluginModule,
      entryFile,
      dirname(entryFile)
    );

    return pluginModule.exports;
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
      onEvent<E extends SystemEvent>(event: E, handler: SystemEventHandler<E>): SystemEventSubscription {
        return PluginModule.pluginEvents().onEvent(event, handler);
      },
      emitEvent<E extends SystemEvent>(event: E, payload: SystemEventPayload[E]): void {
        PluginModule.pluginEvents().emit(event, payload);
      },
    };

    return PluginSandboxService.createGuardedContext(base, manifest.permissions ?? []);
  }

  private static pluginEvents(): PluginEventsService {
    return PluginModule.requireRef(PluginModule.moduleRef, 'ModuleRef').get(PluginEventsService, { strict: false });
  }

  private static requireRef<T>(ref: T | null, name: string): T {
    if (ref === null) {
      throw new Error(`Host ${name} is not available yet; the plugin context was accessed before bootstrap completed.`);
    }
    return ref;
  }
}
