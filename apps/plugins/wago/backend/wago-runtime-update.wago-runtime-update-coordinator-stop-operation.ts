import { WagoRuntimeUpdateCoordinatorState } from "./wago-runtime-update.wago-runtime-update-coordinator-state";
export abstract class WagoRuntimeUpdateCoordinatorStopOperation extends WagoRuntimeUpdateCoordinatorState {


  async stop(): Promise<void> {
    this.stopped = true;
    for (const operation of this.operations) operation.abort();
    // Nest must not close the store while cancelled connections are still
    // unwinding their finally blocks and releasing the device-operation lease.
    if (this.operations.size > 0) await new Promise<void>((resolve) => this.shutdownWaiters.add(resolve));
  }
}
