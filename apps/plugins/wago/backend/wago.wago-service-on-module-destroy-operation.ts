import { WagoServiceOnApplicationBootstrapOperation } from './wago.wago-service-on-application-bootstrap-operation';


export abstract class WagoServiceOnModuleDestroyOperation extends WagoServiceOnApplicationBootstrapOperation {
  onModuleDestroy(): void {
    this.destroyed = true;
    this.networkSubscriptions.forEach((subscriptions) =>
      subscriptions.forEach((subscription) => subscription.unsubscribe()),
    );
    this.networkSubscriptions.clear();
    this.unsubscribe();
    this.claimAcknowledgementSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.claimAcknowledgementSubscriptions.clear();
    this.enrollmentExpiryTimers.forEach((timer) => clearTimeout(timer));
    this.enrollmentExpiryTimers.clear();
    if (this.subscriptionRetryTimer) clearTimeout(this.subscriptionRetryTimer);
    this.commands.destroy();
  }
}
