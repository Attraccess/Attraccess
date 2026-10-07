import { WagoServiceSubscribeMqttOperation } from './wago.wago-service-subscribe-mqtt-operation';


export abstract class WagoServiceIsActiveSubscriptionGenerationOperation extends WagoServiceSubscribeMqttOperation {
  protected isActiveSubscriptionGeneration(generation: number): boolean {
    return !this.destroyed && generation === this.activeSubscriptionGeneration;
  }
}
