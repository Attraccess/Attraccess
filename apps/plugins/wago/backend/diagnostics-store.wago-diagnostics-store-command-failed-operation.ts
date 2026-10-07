import { MAX_CHANNELS } from './diagnostics-store.state';
import { WagoDiagnosticsStoreCommandOperation } from './diagnostics-store.wago-diagnostics-store-command-operation';


export abstract class WagoDiagnosticsStoreCommandFailedOperation extends WagoDiagnosticsStoreCommandOperation {
  commandFailed(id: string, status: 'dispatch-failed' | 'timeout') {
    this.prune();
    const command = this.commands.get(id);
    if (!command) return;
    this.commands.delete(id);
    const state = this.controllers.get(command.controllerId);
    if (!state) return;
    state.touched = this.now();
    state.acknowledgements[command.channelId] = { id, status, receivedAt: new Date(this.now()).toISOString() };
    while (Object.keys(state.acknowledgements).length > MAX_CHANNELS)
      delete state.acknowledgements[Object.keys(state.acknowledgements)[0]];
  }
}
