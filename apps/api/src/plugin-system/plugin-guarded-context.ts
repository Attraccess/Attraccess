import type { EntityTarget, ObjectLiteral } from '@attraccess/plugins-backend-sdk';
import {
  MqttCredentialProvisioningHostProvider,
  MqttServerConnectionConfig,
  PluginContext,
  PluginFlowsContext,
  PluginPermission,
  PluginPermissionError,
  PluginSecretsContext,
  SystemEvent,
  SystemEventHandler,
  SystemEventPayload,
  SystemEventSubscription,
} from '@attraccess/plugins-backend-sdk';
import { Type } from '@nestjs/common';
import type { PluginSandboxService } from './plugin-sandbox.service';

interface PluginSandboxServicePluginGuardedContextContext {
  guardEvents: (typeof PluginSandboxService)['guardEvents'];
  assertRepositoryPermission: (typeof PluginSandboxService)['assertRepositoryPermission'];
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
    audit: base.audit,
    logger: base.logger,
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
    get dataSource() {
      require(PluginPermission.DATABASE_ACCESS, 'dataSource');
      return base.dataSource;
    },
    getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>) {
      context.assertRepositoryPermission(base, declared, entity);
      return base.getRepository(entity);
    },
    get<T>(token: Type<T> | string | symbol): T {
      require(PluginPermission.RESOLVE_HOST_PROVIDERS, `get(${String(token)})`);
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
    get secrets(): PluginSecretsContext {
      require(PluginPermission.MANAGE_SECRETS, 'secrets');
      return base.secrets;
    },
  };
}
