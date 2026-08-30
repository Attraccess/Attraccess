import { DynamicModule, Global, Logger, Module, Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource as HostDataSource } from 'typeorm';
import {
  PluginContext,
  PluginBackendModule,
  PluginEntityClass,
  PluginPermission,
  SystemEvent,
  SystemEventHandler,
  SystemEventPayload,
  SystemEventSubscription,
  MQTT_SERVER_HOST_PROVIDER,
  MQTT_CREDENTIAL_PROVISIONING_HOST_PROVIDER,
  MqttCredentialProvisioningHostProvider,
  MqttServerConnectionConfig,
  MqttServerHostProvider,
  PluginFlowsContext,
  EntityTarget,
  ObjectLiteral,
  Repository,
} from '@attraccess/plugins-backend-sdk';
import { dataSourceConfig } from '../database/datasource';
import { LoadedPluginManifest } from './plugin.manifest';
import { PluginService } from './plugin.service';
import { PluginSandboxService } from './plugin-sandbox.service';
import { PluginEventsService } from './plugin-events.service';
import { PluginController } from './plugin.controller';
import { NpmPluginService } from './npm-plugin.service';
import { PluginClassificationService } from './plugin-classification.service';
import { SettingsModule } from '../settings/settings.module';
import { loadPluginEntryExports } from './plugin-loader';
import { registerPluginFlowNodes } from './plugin-flow-node-registry';
import { PluginMqttService } from './plugin-mqtt.service';
import { MqttModule } from '../mqtt/mqtt.module';
import { MqttCredentialProvisioningService } from '../mqtt/mqtt-credential-provisioning.service';
import { join } from 'path';
import { ResourceFlowsExecutorService } from '../resources/flows/resource-flows-executor.service';

@Global()
@Module({})
export class PluginModule {
  private static pluginManifests: LoadedPluginManifest[];
  private static logger = new Logger(PluginModule.name);
  private static DISABLE_PLUGINS_FLAG = false; // Default to false

  // Host singletons are only available once the DI container is live, which is
  // after forRoot() has already built the plugin modules. The context exposes
  // them through these holders, populated by the module constructor below.
  private static dataSourceRef: HostDataSource | null = null;
  private static eventsRef: EventEmitter2 | null = null;
  private static moduleRef: ModuleRef | null = null;

  constructor(dataSource: HostDataSource, events: EventEmitter2, moduleRef: ModuleRef) {
    PluginModule.dataSourceRef = dataSource;
    PluginModule.eventsRef = events;
    PluginModule.moduleRef = moduleRef;
  }

  public static configure(config: { DISABLE_PLUGINS: boolean }): void {
    PluginModule.DISABLE_PLUGINS_FLAG = config.DISABLE_PLUGINS;
    PluginModule.logger.log(`PluginModule configured. DisablePlugins: ${PluginModule.DISABLE_PLUGINS_FLAG}`);
  }

  public static arePluginsDisabled(): boolean {
    return PluginModule.DISABLE_PLUGINS_FLAG;
  }

  public static forRoot(): DynamicModule {
    if (PluginModule.DISABLE_PLUGINS_FLAG) {
      PluginModule.logger.log('Plugins are disabled');

      return {
        module: PluginModule,
        imports: [SettingsModule, MqttModule],
        providers: [
          PluginService,
          PluginSandboxService,
          PluginEventsService,
          PluginMqttService,
          NpmPluginService,
          PluginClassificationService,
        ],
        exports: [PluginEventsService],
        controllers: [PluginController],
      };
    }

    this.pluginManifests = PluginService.getPlugins();

    const pluginModules = this.pluginManifests
      .filter((manifest) => !PluginService.isPluginQuarantined(manifest))
      .map((manifest) => {
        try {
          const module = PluginModule.loadPluginModule(manifest);
          PluginService.markPluginAsLoaded(`${manifest.name}@${manifest.version}`);
          return module;
        } catch (error) {
          this.logger.error(`Error loading plugin ${manifest.name}`, error);
          PluginService.quarantinePlugin(manifest, error as Error);
          return null;
        }
      })
      .filter((module) => module !== null);

    return {
      module: PluginModule,
      imports: [SettingsModule, MqttModule, ...pluginModules],
      providers: [
        PluginService,
        PluginSandboxService,
        PluginEventsService,
        PluginMqttService,
        NpmPluginService,
        PluginClassificationService,
      ],
      exports: [PluginEventsService],
      controllers: [PluginController],
    };
  }

  private static loadPluginModule(manifest: LoadedPluginManifest): DynamicModule {
    if (!manifest.main.backend?.directory || !manifest.main.backend?.entryPoint) {
      this.logger.error(`Plugin ${manifest.name} has no backend, skipping backend module loading`);
      return null;
    }

    this.logger.log(`Loading plugin ${manifest.name} from ${manifest.main.backend.directory}`);

    const importedModule = loadPluginEntryExports(
      join(PluginService.PLUGIN_PATH, manifest.main.backend.directory, manifest.main.backend.entryPoint),
    );

    this.logger.log(`Imported module: ${manifest.name}`);

    const exported = importedModule.default as PluginBackendModule | DynamicModule;

    // Register any entities the plugin owns into the shared DataSource BEFORE it
    // initialises (which happens later, at NestFactory.create). The schema is
    // owned by the plugin's migrations — this only makes the entity metadata
    // resolvable so the plugin can use context.getRepository(Entity).
    PluginModule.registerPluginEntities(manifest, (exported as PluginBackendModule)?.entities);

    // Register any custom flow nodes contributed by this plugin.
    const pluginFlowNodes = (exported as PluginBackendModule)?.flowNodes;
    if (pluginFlowNodes?.length) {
      registerPluginFlowNodes(manifest.name, pluginFlowNodes);
      this.logger.log(`Registered ${pluginFlowNodes.length} flow node(s) from plugin ${manifest.name}`);
    }

    if (typeof (exported as PluginBackendModule)?.register !== 'function') {
      this.logger.warn(
        `Plugin ${manifest.name} does not export a register(context) factory; loading its default export as a static module.`,
      );
      return exported as DynamicModule;
    }

    const context = PluginModule.createPluginContext(manifest);
    const pluginModule = (exported as PluginBackendModule).register(context);
    const credentialProvider = (exported as PluginBackendModule).credentialProvisioningProvider;
    if (credentialProvider) {
      MqttCredentialProvisioningService.register(credentialProvider(context));
      this.logger.log(`Registered MQTT credential provider from plugin ${manifest.name}.`);
    }
    return {
      ...pluginModule,
      providers: [
        ...(pluginModule.providers ?? []),
        {
          provide: `plugin-mqtt-cleanup:${manifest.id}`,
          useFactory: () => ({
            onModuleDestroy: () => PluginModule.pluginMqtt().clearPlugin(manifest.id),
          }),
        },
      ],
    };
  }

  /**
   * Adds a plugin's declared entities to the host DataSource's entity set so
   * `context.getRepository(Entity)` resolves their metadata. The host runs with
   * `synchronize: false`, so this never alters the schema — the table is owned
   * by the plugin's migration. Gated on DATABASE_ACCESS (the same permission
   * getRepository requires); a plugin without it could not use the entity anyway.
   *
   * Mutates the shared `dataSourceConfig.entities` array in place: this runs at
   * AppModule import time (when `@Module` evaluates its `imports`), before the
   * TypeORM DataSource is constructed at NestFactory.create — so the additions
   * are picked up. Deduped because AppModule is imported once but instantiated
   * more than once during bootstrap.
   */
  private static registerPluginEntities(
    manifest: LoadedPluginManifest,
    entities: PluginEntityClass[] | undefined,
  ): void {
    if (!entities || entities.length === 0) {
      return;
    }

    if (!(manifest.permissions ?? []).includes(PluginPermission.DATABASE_ACCESS)) {
      this.logger.warn(
        `Plugin ${manifest.name} declares ${entities.length} entit(y/ies) but lacks the DATABASE_ACCESS ` +
          `permission; skipping entity registration (getRepository would be denied anyway).`,
      );
      return;
    }

    const registry = dataSourceConfig.entities as unknown[];
    let added = 0;
    for (const entity of entities) {
      if (!registry.includes(entity)) {
        registry.push(entity);
        added++;
      }
    }

    if (added > 0) {
      this.logger.log(`Registered ${added} entit(y/ies) from plugin ${manifest.name} into the host DataSource.`);
    }
  }

  private static createPluginContext(manifest: LoadedPluginManifest): PluginContext {
    const base: PluginContext = {
      manifest: PluginService.toManifestInfo(manifest),
      logger: new Logger(`Plugin:${manifest.name}`),
      mqtt: {
        subscribe(serverId, topicFilter, handler) {
          return PluginModule.pluginMqtt().subscribe(manifest.id, manifest.name, base.logger, serverId, topicFilter, handler);
        },
        publish(serverId, topic, payload, options) {
          return PluginModule.pluginMqtt().publish(serverId, topic, payload, options);
        },
      },
      get events(): EventEmitter2 {
        return PluginModule.requireRef(PluginModule.eventsRef, 'EventEmitter2');
      },
      get dataSource(): PluginContext['dataSource'] {
        return PluginModule.requireRef(
          PluginModule.dataSourceRef,
          'DataSource',
        ) as unknown as PluginContext['dataSource'];
      },
      getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> {
        return PluginModule.requireRef(PluginModule.dataSourceRef, 'DataSource').getRepository(
          entity as never,
        ) as unknown as Repository<T>;
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
      getMqttServerConfig(serverId: number): Promise<MqttServerConnectionConfig | null> {
        const provider = PluginModule.requireRef(PluginModule.moduleRef, 'ModuleRef').get<MqttServerHostProvider>(
          MQTT_SERVER_HOST_PROVIDER,
          { strict: false },
        );
        return provider.getServerConfig(serverId);
      },
      getMqttCredentialProvisioning(): MqttCredentialProvisioningHostProvider {
        return PluginModule.requireRef(PluginModule.moduleRef, 'ModuleRef').get<MqttCredentialProvisioningHostProvider>(
          MQTT_CREDENTIAL_PROVISIONING_HOST_PROVIDER,
          { strict: false },
        );
      },
      get flows(): PluginFlowsContext {
        const executor = PluginModule.requireRef(PluginModule.moduleRef, 'ModuleRef').get(ResourceFlowsExecutorService, {
          strict: false,
        });
        return {
          trigger: (nodeType, matches, payload) => executor.triggerPluginFlows(manifest.name, nodeType, matches, payload),
        };
      },
    };

    return PluginSandboxService.createGuardedContext(base, manifest.permissions ?? []);
  }

  private static pluginEvents(): PluginEventsService {
    return PluginModule.requireRef(PluginModule.moduleRef, 'ModuleRef').get(PluginEventsService, { strict: false });
  }

  private static pluginMqtt(): PluginMqttService {
    return PluginModule.requireRef(PluginModule.moduleRef, 'ModuleRef').get(PluginMqttService, { strict: false });
  }

  private static requireRef<T>(ref: T | null, name: string): T {
    if (ref === null) {
      throw new Error(`Host ${name} is not available yet; the plugin context was accessed before bootstrap completed.`);
    }
    return ref;
  }
}
