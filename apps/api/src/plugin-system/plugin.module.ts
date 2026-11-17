import { Global, Inject, Module, DynamicModule, Type, Logger } from '@nestjs/common';

import { ModuleRef } from '@nestjs/core';

import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  PluginBackendModule,
  MQTT_CREDENTIAL_PROVISIONING_HOST_PROVIDER,
  MQTT_SERVER_HOST_PROVIDER,
  MqttCredentialProvisioningHostProvider,
  MqttServerConnectionConfig,
  MqttServerHostProvider,
  PLUGIN_AUDIT_HOST_PROVIDER,
  PluginAuditHostProvider,
  PluginContext,
  PluginEntityClass,
  declaredPersistenceBackends,
  PluginFlowsContext,
  PluginPermission,
  PluginSecretsContext,
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

import { resolveAppVersion } from '../config/app.config';
import { PluginClassificationService } from './plugin-classification.service';

import { pluginActivationPlan } from './runtime/dependencies';

import { PluginEventsService } from './plugin-events.service';

import { PluginSystemEventsBridge } from './plugin-system-events.bridge';

import { registerPluginFlowNodes } from './flows/node-registry';

import { collectReaderUiContributions } from './runtime/reader-ui-load';
import {
  invalidateReaderUi,
  queueReaderUiContributions,
  queueReaderUiLoadFailure,
  ReaderUiWiring,
  unregisterReaderUi,
} from './runtime/reader-ui-wiring';
import { loadPluginEntryExports } from './runtime/module-loader';

import { PluginMqttService } from './plugin-mqtt.service';

import { PluginSandboxService } from './plugin-sandbox.service';

import { PluginController } from './plugin.controller';
import { PluginAdministrationService } from './plugin-administration.service';

import { PluginUninstallService } from './plugin-uninstall.service';

import { LoadedPluginManifest } from './plugin.manifest';

import { PluginService } from './plugin.service';

import { PluginPersistenceModule } from '../database/adapters/plugins/plugin-persistence.module';
import { createPluginPersistenceHost } from '../database/adapters/plugins/plugin-persistence-host';
import { PLUGIN_HOST_CONNECTION } from './persistence/plugin-host-data.port';
import type { PluginPersistenceHost } from './persistence/plugin-persistence-host.port';
import { assertModulePersistenceSupportsBackend } from './runtime/plugin-compatibility';

import { EncryptionService } from '../encryption/encryption.service';

import { ResourceFlowsExecutorService } from '../resources/flows/execution/resource-flows-executor.service';

import { createPluginAuditContext } from './runtime/audit-context';

import { createPluginBleContext } from './ble/plugin-ble-context';

import { PluginBleService } from './ble/plugin-ble.service';

import { preparePluginNotifications } from './runtime/plugin-notifications';
import {
  PLUGIN_START_BLOCKED_CHANGED_EVENT,
  type PluginStartBlockedChanged,
} from './start-blocked/start-blocked.events';

import {
  createHostDataContext,
  createHostNotificationsContext,
  createHostResourceAccessContext,
  PluginHostRefs,
} from './runtime/host-contexts';

import { arePluginsDisabled, setPluginsDisabled } from './plugins-disabled';

function getImplementationClass(): typeof PluginModule {
  return require('./plugin.module').PluginModule;
}

@Global()
@Module({})
export class PluginModule {
  // Host singletons are only available once the DI container is live, which is
  // after forRoot() has already built the plugin modules. The context exposes
  // them through these holders, populated by the module constructor below.

  constructor(@Inject(PLUGIN_HOST_CONNECTION) connection: object, events: EventEmitter2, moduleRef: ModuleRef) {
    PluginModule.connectionRef = connection;
    PluginModule.eventsRef = events;
    PluginModule.moduleRef = moduleRef;
  }

  protected static logger = new Logger('PluginModule');

  protected static pluginManifests: LoadedPluginManifest[];

  protected static moduleRef: ModuleRef | null = null;

  protected static eventsRef: EventEmitter2 | null = null;

  /** The host's database connection, opaque here: only the persistence adapter knows its type. */
  protected static connectionRef: object | null = null;

  protected static persistenceHostInstance: PluginPersistenceHost | null = null;

  public static forRoot(): DynamicModule {
    if (arePluginsDisabled()) {
      getImplementationClass().logger.log('Plugins are disabled');

      return {
        module: PluginModule,
        imports: [SettingsModule, MqttModule, LiveTopicsModule, PluginPersistenceModule],
        providers: [
          PluginService,
          PluginSandboxService,
          PluginEventsService,
          PluginMqttService,
          NpmPluginService,
          PluginAdministrationService,
          PluginUninstallService,
          PluginClassificationService,
          PluginLiveUpdatesService,
          PluginSystemEventsBridge,
          PluginBleService,
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
        queueReaderUiLoadFailure(
          manifest.name,
          (manifest.permissions ?? []).includes(PluginPermission.ACCESS_HOOKS),
          error as Error,
        );
      }
    }

    return {
      module: PluginModule,
      imports: [SettingsModule, MqttModule, LiveTopicsModule, PluginPersistenceModule, ...pluginModules],
      providers: [
        PluginService,
        PluginSandboxService,
        PluginEventsService,
        PluginMqttService,
        NpmPluginService,
        PluginAdministrationService,
        PluginUninstallService,
        PluginClassificationService,
        PluginLiveUpdatesService,
        PluginSystemEventsBridge,
        PluginBleService,
        ReaderUiWiring,
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

    // A plugin whose storage code does not support the engine the host runs fails here, before anything of it is
    // registered or migrated.
    const persistence = (exported as PluginBackendModule)?.persistence;
    const persistenceHost = getImplementationClass().persistenceHost();
    assertModulePersistenceSupportsBackend(
      manifest.name,
      declaredPersistenceBackends(persistence),
      persistenceHost.backend,
    );

    // Register any entities the plugin owns into the shared connection BEFORE it
    // initialises (which happens later, at NestFactory.create). The schema is
    // owned by the plugin's migrations — this only makes the entity metadata
    // resolvable so the plugin can use its engine subpath's getRepository(Entity).
    const entities = persistence?.[persistenceHost.backend]?.entities ?? [];
    getImplementationClass().registerPluginEntities(manifest, entities);

    const context = getImplementationClass().createPluginContext(manifest, entities);

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

    // Reader UI provider and access hooks. A permission mismatch throws and quarantines the plugin.
    const readerUiContributions = collectReaderUiContributions(
      manifest.name,
      manifest.permissions ?? [],
      exported as PluginBackendModule,
      context,
    );
    // Queued only once the module was built: a plugin quarantined by a throwing register() or credential
    // provider must not keep its hooks and widgets.
    const queueReaderUi = () => {
      if (readerUiContributions) queueReaderUiContributions(manifest.name, readerUiContributions);
    };

    // Notification categories and email templates need SEND_NOTIFICATIONS and are validated here, before anything
    // is queued. They are registered once the module was built, so a quarantined plugin leaves none behind.
    const categories = preparePluginNotifications(
      manifest.name,
      manifest.permissions ?? [],
      (exported as PluginBackendModule)?.notificationCategories,
      (exported as PluginBackendModule)?.emailTemplates,
    );
    const registerCategories = () => categories.register();

    if (typeof (exported as PluginBackendModule)?.register !== 'function') {
      this.logger.warn(
        `Plugin ${manifest.name} does not export a register(context) factory; loading its default export as a static module.`,
      );
      registerCategories();
      queueReaderUi();
      return exported as DynamicModule;
    }

    const pluginModule = (exported as PluginBackendModule).register(context);
    const credentialProvider = (exported as PluginBackendModule).credentialProvisioningProvider;
    if (credentialProvider) {
      MqttCredentialProvisioningService.register(credentialProvider(context));
      this.logger.log(`Registered MQTT credential provider from plugin ${manifest.name}.`);
    }
    registerCategories();
    queueReaderUi();
    return {
      ...pluginModule,
      providers: [
        ...(pluginModule.providers ?? []),
        {
          provide: `plugin-mqtt-cleanup:${manifest.id}`,
          useFactory: () => ({
            // Closing the bootstrap's throwaway app unregisters the categories, so each app registers them again.
            onModuleInit: () => registerCategories(),
            onModuleDestroy: () => {
              getImplementationClass().pluginMqtt().clearPlugin(manifest.id);
              getImplementationClass().pluginLiveUpdates().clearPlugin(manifest.id);
              unregisterReaderUi(manifest.name);
              categories.unregister();
              // Closes this plugin's BLE sessions with `shutdown`; a plugin that never got host refs has none.
              return getImplementationClass().closePluginBleSessions(manifest.id);
            },
          }),
        },
      ],
    };
  }

  /**
   * Adds a plugin's declared entities to the host connection's entity set so the engine subpath's
   * `getRepository(Entity)` resolves their metadata. The host runs with `synchronize: false`, so this never alters
   * the schema: the table is owned by the plugin's migration. Gated on DATABASE_ACCESS (the permission the
   * persistence context requires); a plugin without it could not use the entity anyway.
   */
  protected static registerPluginEntities(manifest: LoadedPluginManifest, entities: PluginEntityClass[]): void {
    if (entities.length === 0) {
      return;
    }

    if (!(manifest.permissions ?? []).includes(PluginPermission.DATABASE_ACCESS)) {
      this.logger.warn(
        `Plugin ${manifest.name} declares ${entities.length} entit(y/ies) but lacks the DATABASE_ACCESS ` +
          `permission; skipping entity registration (persistence would be denied anyway).`,
      );
      return;
    }

    const added = getImplementationClass().persistenceHost().registerEntities(entities);
    if (added > 0) {
      this.logger.log(`Registered ${added} entit(y/ies) from plugin ${manifest.name} into the host connection.`);
    }
  }

  /** The persistence host of the active database backend, resolving the host connection lazily. */
  protected static persistenceHost(): PluginPersistenceHost {
    const owner = getImplementationClass();
    return (owner.persistenceHostInstance ??= createPluginPersistenceHost(() =>
      owner.requireRef(owner.connectionRef, 'DataSource'),
    ));
  }

  protected static createPluginContext(
    manifest: LoadedPluginManifest,
    entities: PluginEntityClass[] = [],
  ): PluginContext {
    const base: PluginContext = {
      // The same version the host uses to check plugin compatibility.
      hostVersion: resolveAppVersion(),
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
      readerUi: { invalidate: (scope) => invalidateReaderUi(manifest.name, scope) },
      ble: createPluginBleContext({ id: manifest.id, logger: new Logger(`Plugin:${manifest.name}`) }, () =>
        getImplementationClass().hostRefs().get(PluginBleService),
      ),
      startBlocked: {
        invalidate: ({ resourceId }) => {
          if (!Number.isInteger(resourceId)) return;
          const changed: PluginStartBlockedChanged = { pluginName: manifest.name, resourceId };
          getImplementationClass().eventsRef?.emit(PLUGIN_START_BLOCKED_CHANGED_EVENT, changed);
        },
      },
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
      notifications: createHostNotificationsContext(manifest.name, getImplementationClass().hostRefs()),
      resourceAccess: createHostResourceAccessContext(getImplementationClass().hostRefs()),
      hostData: createHostDataContext(getImplementationClass().hostRefs()),
      persistence: getImplementationClass().persistenceHost().createContext(manifest.name, entities),
    };

    return PluginSandboxService.createGuardedContext(base, manifest.permissions ?? []);
  }

  /** Lazy host accessors for the runtime context factories; each call throws until bootstrap completed. */
  protected static hostRefs(): PluginHostRefs {
    return {
      get: (token) =>
        getImplementationClass()
          .requireRef(getImplementationClass().moduleRef, 'ModuleRef')
          .get(token, { strict: false }),
    };
  }

  /** Discard host instances when the temporary configuration app is closed. */
  public static resetHostReferences(): void {
    getImplementationClass().connectionRef = null;
    getImplementationClass().eventsRef = null;
    getImplementationClass().moduleRef = null;
  }

  public static configure(config: { DISABLE_PLUGINS: boolean }): void {
    setPluginsDisabled(config.DISABLE_PLUGINS);
    getImplementationClass().logger.log(`PluginModule configured. DisablePlugins: ${arePluginsDisabled()}`);
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

  protected static async closePluginBleSessions(pluginId: string): Promise<void> {
    const ref = getImplementationClass().moduleRef;
    if (!ref) return;
    try {
      await ref.get(PluginBleService, { strict: false }).closePluginSessions(pluginId, 'shutdown');
    } catch (error) {
      getImplementationClass().logger.warn(
        `Closing BLE sessions of plugin ${pluginId} failed: ${(error as Error).message}`,
      );
    }
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
