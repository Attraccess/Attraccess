import { RETENTION_MS } from './diagnostics-store.state';
import { WagoDiagnosticsStoreState } from './diagnostics-store.wago-diagnostics-store-state';


export abstract class WagoDiagnosticsStorePruneOperation extends WagoDiagnosticsStoreState {
  protected prune() {
    const cutoff = this.now() - RETENTION_MS;
    for (const [id, state] of this.controllers) if (state.touched < cutoff) this.controllers.delete(id);
    for (const [id, command] of this.commands) if (command.at < cutoff) this.commands.delete(id);
  }
}
