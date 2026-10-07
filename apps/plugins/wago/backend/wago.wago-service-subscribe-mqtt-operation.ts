import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import type { PluginMqttSubscription } from '@attraccess/plugins-backend-sdk';
import { MqttSubscriptionError } from './wago.mqtt-subscription-error';
import { WagoServiceUnsubscribeOperation } from './wago.wago-service-unsubscribe-operation';


export abstract class WagoServiceSubscribeMqttOperation extends WagoServiceUnsubscribeOperation {
  protected async subscribeMqtt(
    ...args: Parameters<PluginContext['mqtt']['subscribe']>
  ): Promise<PluginMqttSubscription> {
    try {
      return await this.context.mqtt.subscribe(...args);
    } catch (error) {
      throw new MqttSubscriptionError(error);
    }
  }
}
