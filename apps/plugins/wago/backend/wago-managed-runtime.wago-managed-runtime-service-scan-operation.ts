import { RuntimeUpdateError } from './wago-runtime-update';
import { WagoManagedRuntimeServiceReconcileConnectionOperation } from './wago-managed-runtime.wago-managed-runtime-service-reconcile-connection-operation';


export abstract class WagoManagedRuntimeServiceScanOperation extends WagoManagedRuntimeServiceReconcileConnectionOperation {
  protected async scan() {
    // Stable pages and fixed-size batches; no unbounded work queue or controller fanout.
    for (let skip = 0; !this.destroyed; skip += 50) {
      const controllers = await this.controllers.find({
        where: { trustState: 'claimed' },
        order: { id: 'ASC' },
        skip,
        take: 50,
      });
      for (let index = 0; index < controllers.length && !this.destroyed; index += 2)
        await Promise.all(
          controllers.slice(index, index + 2).map(async (controller) => {
            try {
              await this.assertNetworkSettled(controller.id);
              if (this.heartbeats.has(controller.id)) await this.refreshRuntimePolicy(controller.id);
              if (!(await this.completeEnrolment(controller))) return;
              this.verifyingControllers.add(controller.id);
              await this.coordinator.reconcile(controller.id, false, this.heartbeats.get(controller.id)?.imageId);
              this.reconciliationFailures.delete(controller.id);
            } catch (error) {
              this.reconciliationFailures.set(
                controller.id,
                error instanceof RuntimeUpdateError ? error.failure : 'interrupted',
              );
              this.context.logger.warn(`CC100 ${controller.id} managed reconciliation is deferred.`);
            } finally {
              this.verifyingControllers.delete(controller.id);
            }
          }),
        );
      if (controllers.length < 50) break;
    }
  }
}
