import { MAX_CONTROLLERS } from './diagnostics-store.state';
import { WagoDiagnosticsStoreCommandFailedOperation } from './diagnostics-store.wago-diagnostics-store-command-failed-operation';


export abstract class WagoDiagnosticsStoreCanTrackOperation extends WagoDiagnosticsStoreCommandFailedOperation {
  canTrack(id: number): boolean {
    this.prune();
    return (
      this.controllers.has(id) ||
      this.controllers.size < MAX_CONTROLLERS ||
      [...this.controllers.values()].some((state) => !state.activeStream)
    );
  }
}
