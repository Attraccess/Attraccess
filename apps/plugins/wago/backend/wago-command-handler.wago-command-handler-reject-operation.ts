import { WagoCommandError } from './wago-command-handler.wago-command-error';
import { WagoCommandHandlerResolveOperation } from './wago-command-handler.wago-command-handler-resolve-operation';


export abstract class WagoCommandHandlerRejectOperation extends WagoCommandHandlerResolveOperation {
  protected reject(id: string, error: Error): void {
    if (error instanceof WagoCommandError && error.kind === 'acknowledgement-timeout')
      this.dependencies.onCommandFailure?.(id, 'timeout');
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    pending.reject(error);
  }
}
