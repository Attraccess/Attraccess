import { WagoCommissioningServiceSudoRunScriptOperation } from "./wago-commissioning.service.wago-commissioning-service-sudo-run-script-operation";
export abstract class WagoCommissioningServiceRemoteOperationOperation extends WagoCommissioningServiceSudoRunScriptOperation {


  protected async remoteOperation<T>(operation: () => Promise<T>): Promise<T> {
    await this.operationContext.getStore()?.assertOwned();
    return operation();
  }
}
