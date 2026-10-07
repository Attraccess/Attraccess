import { RuntimeDiagnostics } from './diagnostics-store.contracts';
import { RETENTION_MS } from './diagnostics-store.state';
import { emptyStream } from './diagnostics-envelope';
import { WagoDiagnosticsStorePruneOperation } from './diagnostics-store.wago-diagnostics-store-prune-operation';


export abstract class WagoDiagnosticsStoreReadOperation extends WagoDiagnosticsStorePruneOperation {
  read(id: number): RuntimeDiagnostics {
    this.prune();
    const state = this.controllers.get(id);
    const copy: RuntimeDiagnostics = state
      ? JSON.parse(JSON.stringify(state))
      : {
          touched: 0,
          inputs: {},
          outputs: {},
          measurements: {},
          cumulativeMeasurements: {},
          faults: {},
          acknowledgements: {},
          events: [],
          ...emptyStream(),
        };
    const cutoff = this.now() - RETENTION_MS;
    for (const field of [
      'inputs',
      'outputs',
      'measurements',
      'cumulativeMeasurements',
      'faults',
      'acknowledgements',
    ] as const) {
      copy[field] = Object.assign(Object.create(null), copy[field]);
    }
    for (const collection of [
      copy.cumulativeMeasurements,
      copy.inputs,
      copy.outputs,
      copy.measurements,
      copy.faults,
      copy.acknowledgements,
    ]) {
      for (const key of Object.keys(collection))
        if (Date.parse(collection[key].receivedAt) < cutoff) delete collection[key];
    }
    copy.events = copy.events.filter((event) => Date.parse(event.receivedAt) >= cutoff);
    if (copy.rejection && Date.parse(copy.rejection.receivedAt) < cutoff) delete copy.rejection;
    return copy;
  }
}
