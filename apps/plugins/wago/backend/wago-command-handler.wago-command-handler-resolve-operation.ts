import { WagoCommandHandlerWaitForAcknowledgementOperation } from './wago-command-handler.wago-command-handler-wait-for-acknowledgement-operation';


export abstract class WagoCommandHandlerResolveOperation extends WagoCommandHandlerWaitForAcknowledgementOperation {
  protected resolve(id: string): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    pending.resolve();
  }
}
