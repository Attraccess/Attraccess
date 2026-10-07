import { WagoFlowServiceState } from './wago-flow.wago-flow-service-state';
import { FlowSubscriptionError } from './wago-flow.flow-subscription-error';


export abstract class WagoFlowServiceOnModuleInitOperation extends WagoFlowServiceState {
  async onModuleInit(): Promise<void> {
    try {
      await this.refresh();
    } catch (error) {
      if (!(error instanceof FlowSubscriptionError)) throw error;
      this.context.logger.warn(`Could not refresh WAGO flow subscriptions during startup: ${String(error.mqttError)}`);
    }
    // Claims and settings are managed by another service; periodically reconcile this shared subscription.
    this.refreshTimer = setInterval(
      () =>
        void this.refresh().catch((error) =>
          this.context.logger.warn(`Could not refresh WAGO flow subscriptions: ${String(error)}`),
        ),
      60_000,
    );
  }
}
