import { ConflictException } from '@nestjs/common';
import type { PluginMqttSubscription } from '@attraccess/plugins-backend-sdk';
import { WagoServiceState } from './wago.service.wago-service-state';


export abstract class WagoServiceRefreshNetworkConnectionOperation extends WagoServiceState {
  /** Establish the migrated controller's subscriptions without rebuilding or
   * contacting any previous broker. Retained state is replayed only after the
   * complete new set is installed; old captured broker maps become inert.
   */
  async refreshNetworkConnection(controllerId: number): Promise<void> {
    const controller = await this.claimedController(controllerId),
      settings = await this.getSettings();
    const serverId = controller.mqttServerId;
    if (!serverId) throw new ConflictException('Controller MQTT server is unavailable');
    const subscriptions: PluginMqttSubscription[] = [];
    let retained: Buffer | undefined;
    const active = () => !this.destroyed && this.networkSubscriptions.get(controllerId) === subscriptions;
    try {
      const root = `${settings.operationalPrefix}/v1/controllers/${controller.hardwareId}`;
      for (const suffix of [
        'state',
        'measurements',
        'faults',
        'configuration/reported',
        'acknowledgements',
        'heartbeat',
      ]) {
        subscriptions.push(
          await this.subscribeMqtt(serverId, `${root}/${suffix}`, async (message) => {
            if (message.serverId !== controller.mqttServerId || message.topic !== `${root}/${suffix}`) return;
            if (!active()) {
              if (!this.destroyed && suffix === 'state' && message.payload.length <= 65_536)
                retained = Buffer.from(message.payload);
              return;
            }
            if (suffix === 'heartbeat') await this.onHeartbeat(controller.hardwareId, message.payload);
            else {
              this.diagnostics.ingest(controllerId, suffix, message.payload);
              if (suffix === 'configuration/reported') this.enqueueConfigurationReport(controllerId, message.payload);
              if (suffix === 'acknowledgements') this.onCommandAcknowledgement(controllerId, message.payload);
            }
          }),
        );
      }
      if (this.destroyed) throw new Error('Controller subscriptions stopped');
      this.networkSubscriptions.get(controllerId)?.forEach((subscription) => subscription.unsubscribe());
      this.networkSubscriptions.set(controllerId, subscriptions);
      this.networkSubscriptionRevision++;
      if (retained) this.diagnostics.ingest(controllerId, 'state', retained);
    } catch (error) {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      throw error;
    }
  }
}
