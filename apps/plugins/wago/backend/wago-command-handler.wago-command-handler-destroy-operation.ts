import { WagoCommandError } from './wago-command-handler.wago-command-error';
import { WagoCommandHandlerAcknowledgeOperation } from './wago-command-handler.wago-command-handler-acknowledge-operation';


export abstract class WagoCommandHandlerDestroyOperation extends WagoCommandHandlerAcknowledgeOperation {
  destroy(): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new WagoCommandError('WAGO command cancelled during shutdown', 'transport-dispatch'));
      this.pending.delete(id);
    }
  }
}
