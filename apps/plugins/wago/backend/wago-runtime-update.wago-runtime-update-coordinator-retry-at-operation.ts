import { WagoRuntimeUpdateCoordinatorAssertCurrentOperation } from "./wago-runtime-update.wago-runtime-update-coordinator-assert-current-operation";
export abstract class WagoRuntimeUpdateCoordinatorRetryAtOperation extends WagoRuntimeUpdateCoordinatorAssertCurrentOperation {


  protected retryAt(attempt: number) {
    return this.now() + Math.min(30 * 60_000, 30_000 * 2 ** Math.min(attempt - 1, 6));
  }
}
