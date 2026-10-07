import { identifier } from './diagnostics-store.helpers';
import { MAX_CONTROLLERS } from './diagnostics-store.state';
import { WagoDiagnosticsStoreReadOperation } from './diagnostics-store.wago-diagnostics-store-read-operation';


export abstract class WagoDiagnosticsStoreCommandOperation extends WagoDiagnosticsStoreReadOperation {
  command(controllerId: number, channelId: string, id: string) {
    this.prune();
    if (!identifier(channelId) || !identifier(id)) return;
    if (!this.controllers.has(controllerId) && this.controllers.size >= MAX_CONTROLLERS) return;
    const state = this.read(controllerId);
    state.touched = this.now();
    this.controllers.set(controllerId, state);
    const oldest = this.commands.keys().next().value;
    if (this.commands.size >= 1024 && oldest !== undefined) this.commands.delete(oldest);
    this.commands.set(id, { controllerId, channelId, at: this.now() });
  }
}
