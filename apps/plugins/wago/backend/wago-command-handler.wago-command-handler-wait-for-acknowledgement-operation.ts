import { WagoCommandHandlerParseOperation } from './wago-command-handler.wago-command-handler-parse-operation';
import { WagoCommandError } from './wago-command-handler.wago-command-error';


export abstract class WagoCommandHandlerWaitForAcknowledgementOperation extends WagoCommandHandlerParseOperation {
  protected waitForAcknowledgement(id: string, controllerId: number, timeoutSeconds: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.reject(
            id,
            new WagoCommandError('Timed out waiting for WAGO controller acknowledgement', 'acknowledgement-timeout'),
          ),
        timeoutSeconds * 1000,
      );
      this.pending.set(id, { controllerId, resolve, reject, timer });
    });
  }
}
