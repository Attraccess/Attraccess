import { WagoCommandError } from './wago-command-handler';
import { WagoServiceCommandFailureBehaviorOperation } from './wago.wago-service-command-failure-behavior-operation';


export abstract class WagoServiceCommandFailureKindOperation extends WagoServiceCommandFailureBehaviorOperation {
  commandFailureKind(error: unknown) {
    return error instanceof WagoCommandError ? error.kind : 'node-failure';
  }
}
