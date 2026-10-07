import { WagoFlowServiceOnModuleInitOperation } from './wago-flow.wago-flow-service-on-module-init-operation';


export abstract class WagoFlowServiceOnModuleDestroyOperation extends WagoFlowServiceOnModuleInitOperation {
  onModuleDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
    this.waiters.forEach((wake) => wake(undefined, true));
    this.waiters.clear();
    this.waitersByKey.clear();
  }
}
