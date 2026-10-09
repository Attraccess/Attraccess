import { Global, Module, DynamicModule, Type, Logger } from '@nestjs/common';

import { ModuleRef } from '@nestjs/core';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { DataSource as HostDataSource } from 'typeorm';

import {
  PluginBackendModule,
  EntityTarget,
  MQTT_CREDENTIAL_PROVISIONING_HOST_PROVIDER,
  MQTT_SERVER_HOST_PROVIDER,
  MqttCredentialProvisioningHostProvider,
  MqttServerConnectionConfig,
  MqttServerHostProvider,
  ObjectLiteral,
  PLUGIN_AUDIT_HOST_PROVIDER,
  PluginAuditHostProvider,
  PluginContext,
  PluginEntityClass,
  PluginFlowsContext,
  PluginPermission,
  PluginSecretsContext,
  Repository,
  SystemEvent,
  SystemEventHandler,
  SystemEventPayload,
  SystemEventSubscription,
} from '@attraccess/plugins-backend-sdk';

import { join } from 'path';

import { MqttCredentialProvisioningService } from '../mqtt/mqtt-credential-provisioning.service';

import { MqttModule } from '../mqtt/mqtt.module';

import { SettingsModule } from '../settings/settings.module';

import { LiveTopicsModule } from '../live-updates/live-topics.module';

import { PluginLiveUpdatesService } from './plugin-live-updates.service';

import { NpmPluginService } from './npm-plugin.service';

import { registerPluginAuditDomains } from './audit/audit-registry';

import { PluginClassificationService } from './plugin-classification.service';

import { pluginActivationPlan } from './runtime/dependencies';

import { PluginEventsService } from './plugin-events.service';

import { registerPluginFlowNodes } from './flows/node-registry';

import { loadPluginEntryExports } from './runtime/module-loader';

import { PluginMqttService } from './plugin-mqtt.service';

import { PluginSandboxService } from './plugin-sandbox.service';

import { PluginController } from './plugin.controller';

import { LoadedPluginManifest } from './plugin.manifest';

import { PluginService } from './plugin.service';

import { dataSourceConfig } from '../database/datasource';

import { EncryptionService } from '../encryption/encryption.service';

import { ResourceFlowsExecutorService } from '../resources/flows/execution/resource-flows-executor.service';

import { createPluginAuditContext } from './runtime/audit-context';

function getImplementationClass(): typeof PluginModule {
  return require('./plugin.module').PluginModule;
}

@Global()
@Module({})
export class PluginModule {
  // Host singletons are only available once the DI container is live, which is
  // after forRoot() has already built the plugin modules. The context exposes
  // them through these holders, populated by the module constructor below.

  constructor(dataSource: HostDataSource, events: EventEmitter2, moduleRef: ModuleRef) {
    PluginModule.dataSourceRef = dataSource;
    PluginModule.eventsRef = events;
    PluginModule.moduleRef = moduleRef;
  }

  protected static DISABLE_PLUGINS_FLAG = false;

  protected static logger = new Logger('PluginModule');

  protected static pluginManifests: LoadedPluginManifest[];

  protected static moduleRef: ModuleRef | null = null;

  protected static eventsRef: EventEmitter2 | null = null;

  protected static dataSourceRef: HostDataSource | null = null;

  public static forRoot(): DynamicModule {
    if (getImplementationClass().DISABLE_PLUGINS_FLAG) {
      getImplementationClass().logger.log('Plugins are disabled');

      return {
        module: PluginModule,
        imports: [SettingsModule, MqttModule, LiveTopicsModule],
        providers: [
          PluginService,
          PluginSandboxService,
          PluginEventsService,
          PluginMqttService,
          NpmPluginService,
          PluginClassificationService,
          PluginLiveUpdatesService,
        ],
        exports: [PluginEventsService],
        controllers: [PluginController],
      };
    }

    this.pluginManifests = PluginService.getPlugins();

    const { ordered, failures } = pluginActivationPlan(this.pluginManifests);
    for (const [name, error] of failures) {
      const manifest = this.pluginManifests.find((plugin) => plugin.name === name);
      PluginService.setPluginLoadError(`${name}@${manifest.version}`, error);
    }
    const pluginModules: DynamicModule[] = [];
    const modulesByName = new Map<string, DynamicModule>();
    const active = new Set<string>();
    for (const manifest of ordered) {
      if (
        PluginService.isPluginQuarantined(manifest) ||
        PluginService.getPluginsWithLoadStatus().find((plugin) => plugin.name === manifest.name)?.status === 'error'
      )
        continue;
      const failedDependency = manifest.dependencies?.find(
        (dependency) => dependency.required && !active.has(dependency.name),
      );
      if (failedDependency) {
        PluginService.setPluginLoadError(
          `${manifest.name}@${manifest.version}`,
          new Error(
            `Required plugin ${failedDependency.name} failed to load; ${manifest.name} is inactive. Repair or retry the dependency.`,
          ),
        );
        continue;
      }
      try {
        const module = getImplementationClass().loadPluginModule(manifest);
        PluginService.markPluginAsLoaded(`${manifest.name}@${manifest.version}`);
        active.add(manifest.name);
        if (module) {
          const requiredModules = (manifest.dependencies ?? [])
            .filter((dependency) => dependency.required)
            .map((dependency) => modulesByName.get(dependency.name))
            .filter((module) => Boolean(module));
          // Nest also needs these edges so dependency lifecycle hooks run first.
          const configured = requiredModules.length
            ? {
                ...(typeof module === 'function' ? { module: module as Type<unknown> } : module),
                imports: [...(module.imports ?? []), ...requiredModules],
              }
            : module;
          modulesByName.set(manifest.name, configured);
          pluginModules.push(configured);
        }
      } catch (error) {
        this.logger.error(`Error loading plugin ${manifest.name}`, error);
        PluginService.quarantinePlugin(manifest, error as Error);
      }
    }

    return {
      module: PluginModule,
      imports: [SettingsModule, MqttModule, LiveTopicsModule, ...pluginModules],
      providers: [
        PluginService,
        PluginSandboxService,
        PluginEventsService,
        PluginMqttService,
        NpmPluginService,
        PluginClassificationService,
        PluginLiveUpdatesService,
      ],
      exports: [PluginEventsService],
      controllers: [PluginController],
    };
  }

  protected static loadPluginModule(manifest: LoadedPluginManifest): DynamicModule {
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
    getImplementationClass().registerPluginEntities(manifest, (exported as PluginBackendModule)?.entities);

    const context = getImplementationClass().createPluginContext(manifest);

    // Register any custom flow nodes contributed by this plugin.
    const configuredFlowNodes = (exported as PluginBackendModule)?.flowNodes;
    const pluginFlowNodes =
      typeof configuredFlowNodes === 'function' ? configuredFlowNodes(context) : configuredFlowNodes;
    if (pluginFlowNodes?.length) {
      registerPluginFlowNodes(manifest.name, pluginFlowNodes);
      this.logger.log(`Registered ${pluginFlowNodes.length} flow node(s) from plugin ${manifest.name}`);
    }

    // Register any audit domains contributed by this plugin. Throws on invalid or
    // colliding declarations, which quarantines the plugin like any other load failure.
    const configuredAuditDomains = (exported as PluginBackendModule)?.auditDomains;
    const pluginAuditDomains =
      typeof configuredAuditDomains === 'function' ? configuredAuditDomains(context) : configuredAuditDomains;
    if (pluginAuditDomains?.length) {
      registerPluginAuditDomains({ name: manifest.name, id: manifest.id }, pluginAuditDomains);
      this.logger.log(
        `Registered audit domain(s) ${pluginAuditDomains.map((declaration) => declaration.domain).join(', ')} from plugin ${manifest.name}`,
      );
    }

    if (typeof (exported as PluginBackendModule)?.register !== 'function') {
      this.logger.warn(
        `Plugin ${manifest.name} does not export a register(context) factory; loading its default export as a static module.`,
      );
      return exported as DynamicModule;
    }

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
            onModuleDestroy: () => {
              getImplementationClass().pluginMqtt().clearPlugin(manifest.id);
              getImplementationClass().pluginLiveUpdates().clearPlugin(manifest.id);
            },
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
  protected static registerPluginEntities(
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

  protected static createPluginContext(manifest: LoadedPluginManifest): PluginContext {
    const base: PluginContext = {
      liveUpdates: {
        register: (definition) =>
          getImplementationClass().pluginLiveUpdates().register(manifest.id, manifest.name, definition),
      },
      audit: createPluginAuditContext(manifest.id, () =>
        getImplementationClass()
          .requireRef(getImplementationClass().moduleRef, 'ModuleRef')
          .get<PluginAuditHostProvider>(PLUGIN_AUDIT_HOST_PROVIDER, { strict: false }),
      ),
      manifest: PluginService.toManifestInfo(manifest),
      logger: new Logger(`Plugin:${manifest.name}`),
      mqtt: {
        subscribe(serverId, topicFilter, handler) {
          return getImplementationClass()
            .pluginMqtt()
            .subscribe(manifest.id, manifest.name, base.logger, serverId, topicFilter, handler);
        },
        publish(serverId, topic, payload, options) {
          return getImplementationClass().pluginMqtt().publish(serverId, topic, payload, options);
        },
        refreshConnection(serverId) {
          return getImplementationClass().pluginMqtt().refreshConnection(serverId);
        },
      },
      get events(): EventEmitter2 {
        return getImplementationClass().requireRef(getImplementationClass().eventsRef, 'EventEmitter2');
      },
      get dataSource(): PluginContext['dataSource'] {
        return getImplementationClass().requireRef(
          getImplementationClass().dataSourceRef,
          'DataSource',
        ) as unknown as PluginContext['dataSource'];
      },
      getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> {
        const resolveRepository = (): Repository<T> =>
          getImplementationClass()
            .requireRef(getImplementationClass().dataSourceRef, 'DataSource')
            .getRepository(entity as never) as unknown as Repository<T>;
        if (getImplementationClass().dataSourceRef) return resolveRepository();

        // Nest constructs plugin providers before it constructs PluginModule and
        // injects the host DataSource. Older shipped plugins retain repositories
        // in their constructors; defer only the repository's use until the host
        // reference is ready. Bind methods to the real TypeORM Repository.
        let resolved: Repository<T> | undefined;
        const repository = (): Repository<T> => {
          if (!resolved) {
            // The initial sandbox check may have fallen back to DATABASE_ACCESS
            // because metadata was unavailable before host injection. Resolve
            // the entity permission again against the live DataSource.
            PluginSandboxService.assertRepositoryPermission(base, manifest.permissions ?? [], entity);
            resolved = resolveRepository();
          }
          return resolved;
        };
        return new Proxy({} as Repository<T>, {
          get: (_, property) => {
            const actual = repository();
            const value = Reflect.get(actual, property, actual);
            return typeof value === 'function' ? value.bind(actual) : value;
          },
          set: (_, property, value) => Reflect.set(repository(), property, value),
        });
      },
      get<T>(token: Type<T> | string | symbol): T {
        return getImplementationClass()
          .requireRef(getImplementationClass().moduleRef, 'ModuleRef')
          .get<T>(token, { strict: false });
      },
      onEvent<E extends SystemEvent>(event: E, handler: SystemEventHandler<E>): SystemEventSubscription {
        return getImplementationClass().pluginEvents().onEvent(event, handler);
      },
      emitEvent<E extends SystemEvent>(event: E, payload: SystemEventPayload[E]): void {
        getImplementationClass().pluginEvents().emit(event, payload);
      },
      getMqttServerConfig(serverId: number): Promise<MqttServerConnectionConfig | null> {
        const provider = getImplementationClass()
          .requireRef(getImplementationClass().moduleRef, 'ModuleRef')
          .get<MqttServerHostProvider>(MQTT_SERVER_HOST_PROVIDER, { strict: false });
        return provider.getServerConfig(serverId);
      },
      getMqttCredentialProvisioning(): MqttCredentialProvisioningHostProvider {
        return getImplementationClass()
          .requireRef(getImplementationClass().moduleRef, 'ModuleRef')
          .get<MqttCredentialProvisioningHostProvider>(MQTT_CREDENTIAL_PROVISIONING_HOST_PROVIDER, { strict: false });
      },
      get flows(): PluginFlowsContext {
        const executor = getImplementationClass()
          .requireRef(getImplementationClass().moduleRef, 'ModuleRef')
          .get(ResourceFlowsExecutorService, {
            strict: false,
          });
        return {
          trigger: (nodeType, matches, payload) =>
            executor.triggerPluginFlows(manifest.name, nodeType, matches, payload),
        };
      },
      get secrets(): PluginSecretsContext {
        const encryption = getImplementationClass()
          .requireRef(getImplementationClass().moduleRef, 'ModuleRef')
          .get(EncryptionService, {
            strict: false,
          });
        return {
          encrypt: (plaintext) => encryption.encryptForPlugin(manifest.id, plaintext),
          decrypt: (ciphertext) => encryption.decryptForPlugin(manifest.id, ciphertext),
        };
      },
    };

    return PluginSandboxService.createGuardedContext(base, manifest.permissions ?? []);
  }

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

  protected static pluginLiveUpdates(): PluginLiveUpdatesService {
    return getImplementationClass()
      .requireRef(getImplementationClass().moduleRef, 'ModuleRef')
      .get(PluginLiveUpdatesService, { strict: false });
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
