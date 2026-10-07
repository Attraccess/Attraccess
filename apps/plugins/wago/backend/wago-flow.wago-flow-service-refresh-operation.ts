import type { PluginMqttSubscription } from '@attraccess/plugins-backend-sdk';
import { operationalWildcardTopic } from './protocol';
import { WagoFlowServiceOnModuleDestroyOperation } from './wago-flow.wago-flow-service-on-module-destroy-operation';
import { FlowSubscriptionError } from './wago-flow.flow-subscription-error';


export abstract class WagoFlowServiceRefreshOperation extends WagoFlowServiceOnModuleDestroyOperation {
  async refresh(): Promise<void> {
    const settings = await this.settings.findOneBy({ id: 1 });
    if (!settings) return;
    const controllers = await this.controllers.find({ where: { trustState: 'claimed' } });
    const controllerIds = new Set(controllers.map((controller) => controller.id));
    for (const id of this.offlineControllers) if (!controllerIds.has(id)) this.offlineControllers.delete(id);
    for (const id of this.unavailableHardware) if (!controllerIds.has(id)) this.unavailableHardware.delete(id);
    for (const id of this.unavailableConfiguration)
      if (!controllerIds.has(id)) this.unavailableConfiguration.delete(id);
    for (const id of this.appliedConfigurations.keys())
      if (!controllerIds.has(id)) this.appliedConfigurations.delete(id);
    for (const id of this.streams.keys()) if (!controllerIds.has(id)) this.streams.delete(id);
    this.channelCache.clear();
    const revisions = await this.loadLatestAppliedRevisions(controllers.map((controller) => controller.id));
    for (const revision of revisions) this.cacheChannels(revision);
    for (const controller of controllers)
      if (!this.channelCache.has(controller.id)) this.channelCache.set(controller.id, []);
    const validChannels = new Map(
      controllers.map((controller) => [
        controller.id,
        new Set((this.channelCache.get(controller.id) ?? []).map((channel) => channel.id)),
      ]),
    );
    for (const [key, state] of this.cache)
      if (!validChannels.get(state.controllerId)?.has(state.channelId)) this.cache.delete(key);
    const serverIds = new Set(
      controllers
        .map((controller) => controller.mqttServerId ?? settings.defaultMqttServerId)
        .filter(Boolean) as number[],
    );
    const controllerByHardwareId = new Map(
      controllers
        .map(
          (controller) =>
            [
              controller.hardwareId,
              { controller, serverId: controller.mqttServerId ?? settings.defaultMqttServerId },
            ] as const,
        )
        .filter(([, entry]) => Boolean(entry.serverId)),
    );
    const wildcardTopic = operationalWildcardTopic(settings.operationalPrefix);
    const replacements: PluginMqttSubscription[] = [];
    try {
      for (const serverId of serverIds)
        replacements.push(
          await this.context.mqtt.subscribe(serverId, wildcardTopic, (message) =>
            this.onMessage(serverId, settings.operationalPrefix, message.topic, message.payload),
          ),
        );
    } catch (error) {
      replacements.forEach((subscription) => subscription.unsubscribe());
      throw new FlowSubscriptionError(error);
    }
    this.subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
    this.subscriptions.push(...replacements);
    this.controllerByHardwareId = controllerByHardwareId;
  }
}
