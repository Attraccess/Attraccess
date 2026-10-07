import { WagoServiceRebuildSubscriptionsOperation } from './wago.service.wago-service-rebuild-subscriptions-operation';


export abstract class WagoServiceUnsubscribeOperation extends WagoServiceRebuildSubscriptionsOperation {
  protected unsubscribe(): void {
    this.subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
  }
}
