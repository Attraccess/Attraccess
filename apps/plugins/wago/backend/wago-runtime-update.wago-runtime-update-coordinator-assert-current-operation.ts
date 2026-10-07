import { RuntimeUpdateError } from "./wago-runtime-update.errors";
import { WagoRuntimeUpdateCoordinatorStopOperation } from "./wago-runtime-update.wago-runtime-update-coordinator-stop-operation";
export abstract class WagoRuntimeUpdateCoordinatorAssertCurrentOperation extends WagoRuntimeUpdateCoordinatorStopOperation {


  protected async assertCurrent(imageId: string) {
    if ((await this.desired()).imageId !== imageId) throw new RuntimeUpdateError('release_changed');
  }
}
