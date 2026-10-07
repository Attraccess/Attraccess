import { WagoManagedRuntimeServiceRefreshRuntimePolicyOperation } from './wago-managed-runtime.wago-managed-runtime-service-refresh-runtime-policy-operation';


export abstract class WagoManagedRuntimeServiceReconcileConnectionOperation extends WagoManagedRuntimeServiceRefreshRuntimePolicyOperation {
  protected async reconcileConnection(id: number): Promise<void> {
    await this.assertNetworkSettled(id);
    const heartbeat = await this.refreshRuntimePolicy(id);
    if (!heartbeat) return;
    const controller = await this.controllers.findOneBy({ id, trustState: 'claimed' });
    if (controller && (await this.completeEnrolment(controller)))
      await this.coordinator.reconcile(id, true, heartbeat.imageId);
  }
}
