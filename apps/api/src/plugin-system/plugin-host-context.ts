import type { PluginModule } from './plugin.module';
import {
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
import { Logger, Type } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { dataSourceConfig } from '../database/datasource';
import { EncryptionService } from '../encryption/encryption.service';
import { ResourceFlowsExecutorService } from '../resources/flows/resource-flows-executor.service';
import { createPluginAuditContext } from './plugin-audit-context';
import { PluginModuleRouteContext } from './plugin.module.route-context';
import { PluginSandboxService } from './plugin-sandbox.service';
import { LoadedPluginManifest } from './plugin.manifest';
import { PluginService } from './plugin.service';

function getImplementationClass(): typeof PluginModule {
  return require('./plugin.module').PluginModule;
}

export abstract class PluginHostContextImplementation extends PluginModuleRouteContext {
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
}
