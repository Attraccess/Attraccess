import { WagoManagedAccess, WagoRuntimeUpdateEntity, WagoDeviceOperation } from './wago-managed-access.entity';
import { WagoDeviceOperations } from './wago-device-operations';
import { WagoRuntimeUpdateCoordinator, RuntimeUpdateError } from './wago-runtime-update';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoController } from './wago-controller.entity';
import { admitEnvelope, emptyStream } from './diagnostics-envelope';
import { WagoManagedRuntimeServiceState } from './wago-managed-runtime.wago-managed-runtime-service-state';

export abstract class WagoManagedRuntimeServiceOnApplicationBootstrapOperation extends WagoManagedRuntimeServiceState {
  public onApplicationBootstrap(): void {
    this.access = this.context.getRepository(WagoManagedAccess);
    this.updates = this.context.getRepository(WagoRuntimeUpdateEntity);
    this.sessions = this.context.getRepository(WagoCommissioningSession);
    this.controllers = this.context.getRepository(WagoController);
    this.operations = new WagoDeviceOperations(this.context.getRepository(WagoDeviceOperation));
    this.coordinator = new WagoRuntimeUpdateCoordinator(
      this.updateStore(),
      () => this.desired(),
      this.updateHost(),
      (record) => this.auditUpdate(record),
    );
    this.wago.registerRuntimeStatusHandler((id, heartbeat) => {
      const stream = this.heartbeatStreams.get(id) ?? emptyStream();
      if (
        admitEnvelope(
          stream,
          { ...heartbeat, timestamp: new Date(heartbeat.timestamp).toISOString() },
          'heartbeat',
          Date.now(),
        ) === 'rejected'
      )
        return;
      this.heartbeatStreams.set(id, stream);
      const previous = this.heartbeats.get(id);
      this.heartbeats.delete(id);
      this.heartbeats.set(id, heartbeat);
      if (this.heartbeats.size > 200) {
        const oldest = [...this.heartbeats.keys()].find((candidate) => !this.verifyingControllers.has(candidate));
        if (oldest !== undefined) {
          this.heartbeats.delete(oldest);
          this.heartbeatStreams.delete(oldest);
        }
      }
      if (
        !previous ||
        previous.runtimePolicyToken !== heartbeat.runtimePolicyToken ||
        previous.streamId !== heartbeat.streamId ||
        previous.imageId !== heartbeat.imageId ||
        previous.runtimeVersion !== heartbeat.runtimeVersion ||
        heartbeat.receivedAt - previous.receivedAt > 90_000
      ) {
        this.wago.blockRuntime?.(id);
        if (!this.connectingControllers.has(id) && this.connectingControllers.size < 200) {
          this.connectingControllers.add(id);
          void this.reconcileConnection(id)
            .catch((error) => {
              this.reconciliationFailures.set(id, error instanceof RuntimeUpdateError ? error.failure : 'interrupted');
              this.context.logger.warn(`CC100 ${id} runtime update requires attention.`);
            })
            .finally(() => this.connectingControllers.delete(id));
        } else {
          // The new boot needs policy confirmation while its updater is waiting
          // for readiness. Never queue that confirmation behind the update itself.
          void this.refreshRuntimePolicy(id).catch((error) => {
            this.reconciliationFailures.set(id, error instanceof RuntimeUpdateError ? error.failure : 'interrupted');
          });
        }
      }
      this.wake();
    });
    this.timer = setInterval(() => this.wake(), 30_000).unref();
    this.wake();
  }
}
