import { WagoCommandHandlerExecuteOperation } from './wago-command-handler.wago-command-handler-execute-operation';
import { WagoCommandError } from './wago-command-handler.wago-command-error';


export abstract class WagoCommandHandlerAcknowledgeOperation extends WagoCommandHandlerExecuteOperation {
  acknowledge(controllerId: number, payload: Buffer): void {
    let acknowledgement: { id?: unknown; status?: unknown; error?: unknown; message?: unknown };
    try {
      acknowledgement = JSON.parse(payload.toString('utf8'));
    } catch {
      return;
    }
    if (
      !acknowledgement ||
      typeof acknowledgement !== 'object' ||
      typeof acknowledgement.id !== 'string' ||
      !['accepted', 'duplicate', 'rejected'].includes(acknowledgement.status as string)
    )
      return;
    const pending = this.pending.get(acknowledgement.id);
    if (!pending || pending.controllerId !== controllerId) return;
    if (acknowledgement.status === 'accepted' || acknowledgement.status === 'duplicate')
      return this.resolve(acknowledgement.id);
    this.reject(
      acknowledgement.id,
      new WagoCommandError(
        typeof acknowledgement.message === 'string'
          ? acknowledgement.message
          : typeof acknowledgement.error === 'string'
            ? acknowledgement.error
            : 'controller rejected command',
        'controller-rejection',
      ),
    );
  }
}
