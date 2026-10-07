import type { PluginMqttSubscription } from '@attraccess/plugins-backend-sdk';
import {
  DISCOVERY_ROOT,
  acknowledgementHardwareId,
  acknowledgementWildcardTopic,
  configurationReportedHardwareId,
  configurationReportedWildcardTopic,
  heartbeatTopic,
} from './protocol';
import { WagoServiceSubscribeConfiguredServersOperation } from './wago.wago-service-subscribe-configured-servers-operation';
import { MqttSubscriptionError } from './wago.mqtt-subscription-error';

export abstract class WagoServiceRebuildSubscriptionsOperation extends WagoServiceSubscribeConfiguredServersOperation {
  protected async rebuildSubscriptions(): Promise<void> {
    if (this.destroyed) return;
    const networkRevision = this.networkSubscriptionRevision;
    const settings = await this.getSettings();
    const [controllers, enrollments] = await Promise.all([this.controllers.find(), this.activeEnrollments()]);
    const serverIds = new Set<number>();
    if (settings.defaultMqttServerId) serverIds.add(settings.defaultMqttServerId);
    controllers
      .filter((controller) => controller.trustState === 'claimed')
      .forEach((controller) => {
        const serverId = controller.mqttServerId ?? settings.defaultMqttServerId;
        if (serverId) serverIds.add(serverId);
      });
    enrollments.forEach((enrollment) => {
      serverIds.add(enrollment.mqttServerId);
    });
    const generation = this.activeSubscriptionGeneration + 1;
    const replacements: PluginMqttSubscription[] = [];
    const retainedStates = new Map<number, Buffer>();
    try {
      for (const serverId of serverIds) {
        replacements.push(
          await this.subscribeMqtt(serverId, `${DISCOVERY_ROOT}/+`, async (message) => {
            if (!this.isActiveSubscriptionGeneration(generation)) return;
            await this.onDiscovery(serverId, message.topic, message.payload);
          }),
        );
        if (this.destroyed) {
          replacements.forEach((subscription) => subscription.unsubscribe());
          return;
        }
        const claimedControllers = controllers.filter(
          (item) => item.trustState === 'claimed' && (item.mqttServerId ?? settings.defaultMqttServerId) === serverId,
        );
        const controllersByHardwareId = new Map(
          claimedControllers.map((controller) => [controller.hardwareId, controller]),
        );
        replacements.push(
          await this.subscribeMqtt(
            serverId,
            configurationReportedWildcardTopic(settings.operationalPrefix),
            (message) => {
              if (!this.isActiveSubscriptionGeneration(generation)) return;
              const hardwareId = configurationReportedHardwareId(settings.operationalPrefix, message.topic);
              const controller = hardwareId ? controllersByHardwareId.get(hardwareId) : undefined;
              if (controller && !this.networkSubscriptions.has(controller.id)) {
                this.diagnostics.ingest(controller.id, 'configuration/reported', message.payload);
                this.enqueueConfigurationReport(controller.id, message.payload);
              }
            },
          ),
        );
        replacements.push(
          await this.subscribeMqtt(serverId, acknowledgementWildcardTopic(settings.operationalPrefix), (message) => {
            if (!this.isActiveSubscriptionGeneration(generation)) return;
            const hardwareId = acknowledgementHardwareId(settings.operationalPrefix, message.topic);
            const controller = hardwareId ? controllersByHardwareId.get(hardwareId) : undefined;
            if (controller && !this.networkSubscriptions.has(controller.id)) {
              this.diagnostics.ingest(controller.id, 'acknowledgements', message.payload);
              this.onCommandAcknowledgement(controller.id, message.payload);
            }
          }),
        );
        if (this.destroyed) {
          replacements.forEach((subscription) => subscription.unsubscribe());
          return;
        }
        for (const controller of claimedControllers) {
          for (const suffix of ['state', 'measurements', 'faults']) {
            replacements.push(
              await this.subscribeMqtt(
                serverId,
                `${settings.operationalPrefix}/v1/controllers/${controller.hardwareId}/${suffix}`,
                (message) => {
                  if (this.isActiveSubscriptionGeneration(generation) && !this.networkSubscriptions.has(controller.id))
                    this.diagnostics.ingest(controller.id, suffix, message.payload);
                  // MQTT may deliver a retained snapshot before the generation swap completes.
                  else if (!this.destroyed && suffix === 'state' && message.payload.length <= 65_536)
                    retainedStates.set(controller.id, Buffer.from(message.payload));
                },
              ),
            );
          }
          replacements.push(
            await this.subscribeMqtt(
              serverId,
              heartbeatTopic(settings.operationalPrefix, controller.hardwareId),
              async (message) => {
                if (!this.isActiveSubscriptionGeneration(generation) || this.networkSubscriptions.has(controller.id))
                  return;
                await this.onHeartbeat(controller.hardwareId, message.payload);
              },
            ),
          );
          if (this.destroyed) {
            replacements.forEach((subscription) => subscription.unsubscribe());
            return;
          }
        }
      }
    } catch (error) {
      replacements.forEach((subscription) => subscription.unsubscribe());
      if (error instanceof MqttSubscriptionError) {
        // One disconnected broker must not prevent an already enrolled device
        // on another broker from reconnecting after an API restart. Establish
        // controller subscriptions independently while the full generation is
        // retried; an existing independent set stays active until a full swap.
        await Promise.allSettled(
          controllers
            .filter(
              (controller) => controller.trustState === 'claimed' && !this.networkSubscriptions.has(controller.id),
            )
            .map((controller) => this.refreshNetworkConnection(controller.id)),
        );
      }
      throw error;
    }
    if (this.destroyed) {
      replacements.forEach((subscription) => subscription.unsubscribe());
      return;
    }
    // A migration may have installed its direct subscriptions after this
    // rebuild captured the old controller/broker associations. Never let that
    // stale generation discard the successfully migrated connection.
    if (networkRevision !== this.networkSubscriptionRevision) {
      replacements.forEach((subscription) => subscription.unsubscribe());
      this.scheduleSubscriptionRetry();
      return;
    }
    // New handlers are inert until this synchronous generation swap disables the old set.
    this.activeSubscriptionGeneration = generation;
    this.networkSubscriptions.forEach((subscriptions) =>
      subscriptions.forEach((subscription) => subscription.unsubscribe()),
    );
    this.networkSubscriptions.clear();
    retainedStates.forEach((payload, controllerId) => this.diagnostics.ingest(controllerId, 'state', payload));
    this.unsubscribe();
    this.subscriptions.push(...replacements);
  }
}
