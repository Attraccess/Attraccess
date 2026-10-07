import { WagoDiagnosticsStoreApplyEventsOperation } from './diagnostics-store.wago-diagnostics-store-apply-events-operation';

export class WagoDiagnosticsStore extends WagoDiagnosticsStoreApplyEventsOperation {
  constructor(now: () => number = Date.now) {
    super(now);
  }
}

export { type Freshness } from './diagnostics-store.freshness';
export { freshness } from './diagnostics-store.freshness';
export { type DiagnosticSample } from './diagnostics-store.contracts';
export { type DiagnosticAcknowledgement } from './diagnostics-store.contracts';
