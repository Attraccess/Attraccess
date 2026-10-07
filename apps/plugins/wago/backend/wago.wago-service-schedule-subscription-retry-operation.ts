import { ENROLLMENT_RETRY_MS } from './wago.state';
import { WagoServiceWithConfigurationLockOperation } from './wago.service.wago-service-with-configuration-lock-operation';


export abstract class WagoServiceScheduleSubscriptionRetryOperation extends WagoServiceWithConfigurationLockOperation {
  protected scheduleSubscriptionRetry(): void {
    if (this.destroyed || this.subscriptionRetryTimer) return;
    this.subscriptionRetryTimer = setTimeout(() => {
      this.subscriptionRetryTimer = null;
      if (this.destroyed) return;
      void this.subscribeConfiguredServers().catch((error) => {
        this.context.logger.warn(`Could not refresh WAGO MQTT subscriptions: ${String(error)}`);
        this.scheduleSubscriptionRetry();
      });
    }, ENROLLMENT_RETRY_MS);
  }
}
