import { Dependencies } from './wago-command-handler.contracts';
import { WagoCommandHandlerCachedOperation } from './wago-command-handler.wago-command-handler-cached-operation';

export class WagoCommandHandler extends WagoCommandHandlerCachedOperation {
  constructor(dependencies: Dependencies) {
    super(dependencies);
  }
}

export { WagoCommandError } from './wago-command-handler.errors.classes';
