import { RuntimeDiagnostics } from './diagnostics-store.contracts';
import { WagoDiagnosticsStorePruneContract } from './diagnostics-store.wago-diagnostics-store-prune-contract';


export abstract class WagoDiagnosticsStoreState extends WagoDiagnosticsStorePruneContract {
  protected readonly controllers = new Map<number, RuntimeDiagnostics>();

  protected readonly commands = new Map<string, { controllerId: number; channelId: string; at: number }>();

  constructor(protected readonly now: () => number = Date.now) {
    super();
  }
}
