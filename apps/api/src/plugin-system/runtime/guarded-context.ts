import {
  MqttCredentialProvisioningHostProvider,
  MqttServerConnectionConfig,
  PluginBleContext,
  PluginContext,
  PluginFlowsContext,
  PluginHostDataContext,
  PluginPersistenceContext,
  PluginStorageContext,
  PluginNotificationsContext,
  PluginResourceAccessContext,
  PluginPermission,
  PluginPermissionError,
  PluginReaderUiApi,
  PluginStartBlockedApi,
  PluginSecretsContext,
  SystemEvent,
  SystemEventHandler,
  SystemEventPayload,
  SystemEventSubscription,
} from '@attraccess/plugins-backend-sdk';
import { Type } from '@nestjs/common';
import type { PluginSandboxService } from '../plugin-sandbox.service';
import { assertNotDatabaseToken } from './database-tokens';

interface PluginSandboxServicePluginGuardedContextContext {
  guardEvents: (typeof PluginSandboxService)['guardEvents'];
}

/** The permission that guards each group of `hostData`. */
const HOST_DATA_PERMISSIONS: Record<keyof PluginHostDataContext, PluginPermission> = {
  resources: PluginPermission.ACCESS_RESOURCES,
  users: PluginPermission.READ_USERS,
  settings: PluginPermission.READ_SETTINGS,
  flows: PluginPermission.TRIGGER_FLOWS,
};

/** Wraps one host data group so every method checks the group's permission when it is called. */
function guardDirectory<T extends object>(
  group: T,
  groupName: string,
  permission: PluginPermission,
  require: (permission: PluginPermission, capability: string) => void,
): T {
  return new Proxy(group, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        require(permission, `hostData.${groupName}.${String(property)}()`);
        return value.apply(target, args);
      };
    },
  });
}
export function createGuardedContext(
  context: PluginSandboxServicePluginGuardedContextContext,
  base: PluginContext,
  declared: PluginPermission[],
): PluginContext {
  const pluginName = base.manifest.name;
  const granted = new Set(declared);

  const require = (permission: PluginPermission, capability: string): void => {
    if (!granted.has(permission)) {
      throw new PluginPermissionError(pluginName, capability, permission);
    }
  };

  const guardedEvents = context.guardEvents(base, pluginName, require);

  return {
    manifest: base.manifest,
    hostVersion: base.hostVersion,
    audit: base.audit,
    liveUpdates: base.liveUpdates,
    logger: base.logger,
    // The license is the installation's, not a host capability: it needs no permission.
    license: base.license,
    mqtt: {
      subscribe(serverId, topicFilter, handler) {
        require(PluginPermission.ACCESS_MQTT_SERVERS, `mqtt.subscribe(${serverId}, ${topicFilter})`);
        return base.mqtt.subscribe(serverId, topicFilter, handler);
      },
      publish(serverId, topic, payload, options) {
        require(PluginPermission.ACCESS_MQTT_SERVERS, `mqtt.publish(${serverId}, ${topic})`);
        return base.mqtt.publish(serverId, topic, payload, options);
      },
      refreshConnection(serverId) {
        require(PluginPermission.ACCESS_MQTT_SERVERS, `mqtt.refreshConnection(${serverId})`);
        if (!base.mqtt.refreshConnection) throw new Error('MQTT connection refresh is unavailable in this host');
        return base.mqtt.refreshConnection(serverId);
      },
    },
    events: guardedEvents,
    get<T>(token: Type<T> | string | symbol): T {
      require(PluginPermission.RESOLVE_HOST_PROVIDERS, `get(${String(token)})`);
      // No permission opens the database: plugin data goes through `storage`, never through a connection.
      assertNotDatabaseToken(pluginName, token);
      return base.get<T>(token);
    },
    onEvent<E extends SystemEvent>(event: E, handler: SystemEventHandler<E>): SystemEventSubscription {
      require(PluginPermission.LISTEN_EVENTS, `onEvent(${event})`);
      return base.onEvent(event, handler);
    },
    emitEvent<E extends SystemEvent>(event: E, payload: SystemEventPayload[E]): void {
      require(PluginPermission.EMIT_EVENTS, `emitEvent(${event})`);
      base.emitEvent(event, payload);
    },
    getMqttServerConfig(serverId: number): Promise<MqttServerConnectionConfig | null> {
      require(PluginPermission.ACCESS_MQTT_SERVERS, `getMqttServerConfig(${serverId})`);
      return base.getMqttServerConfig(serverId);
    },
    getMqttCredentialProvisioning(): MqttCredentialProvisioningHostProvider {
      require(PluginPermission.ACCESS_MQTT_SERVERS, 'getMqttCredentialProvisioning()');
      return base.getMqttCredentialProvisioning();
    },
    get flows(): PluginFlowsContext {
      require(PluginPermission.TRIGGER_FLOWS, 'flows.trigger()');
      return base.flows;
    },
    get readerUi(): PluginReaderUiApi {
      require(PluginPermission.READER_UI, 'readerUi.invalidate()');
      if (!base.readerUi) throw new Error('Reader UI is unavailable in this host');
      return base.readerUi;
    },
    get ble(): PluginBleContext {
      require(PluginPermission.BLE_TRANSPORT, 'ble');
      if (!base.ble) throw new Error('BLE transport is unavailable in this host');
      return base.ble;
    },
    get secrets(): PluginSecretsContext {
      require(PluginPermission.MANAGE_SECRETS, 'secrets');
      return base.secrets;
    },
    get startBlocked(): PluginStartBlockedApi {
      require(PluginPermission.ACCESS_HOOKS, 'startBlocked.invalidate()');
      return base.startBlocked;
    },
    get notifications(): PluginNotificationsContext {
      require(PluginPermission.SEND_NOTIFICATIONS, 'notifications.dispatch()');
      return base.notifications;
    },
    get resourceAccess(): PluginResourceAccessContext {
      require(PluginPermission.ACCESS_RESOURCES, 'resourceAccess');
      return base.resourceAccess;
    },
    get persistence(): PluginPersistenceContext {
      require(PluginPermission.PLUGIN_STORAGE, 'persistence');
      return base.persistence;
    },
    get storage(): PluginStorageContext {
      require(PluginPermission.PLUGIN_STORAGE, 'storage');
      return base.storage;
    },
    get hostData(): PluginHostDataContext {
      const hostData = base.hostData;
      return {
        resources: guardDirectory(hostData.resources, 'resources', HOST_DATA_PERMISSIONS.resources, require),
        users: guardDirectory(hostData.users, 'users', HOST_DATA_PERMISSIONS.users, require),
        settings: guardDirectory(hostData.settings, 'settings', HOST_DATA_PERMISSIONS.settings, require),
        flows: guardDirectory(hostData.flows, 'flows', HOST_DATA_PERMISSIONS.flows, require),
      };
    },
  };
}
