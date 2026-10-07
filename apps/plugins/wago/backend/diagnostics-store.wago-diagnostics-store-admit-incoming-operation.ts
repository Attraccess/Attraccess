import { admitEnvelope } from './diagnostics-envelope';
import { sourceTime } from './diagnostics-envelope';
import { RuntimeDiagnostics } from './diagnostics-store.contracts';
import { WagoDiagnosticsStoreIngestOperation } from './diagnostics-store.wago-diagnostics-store-ingest-operation';


export abstract class WagoDiagnosticsStoreAdmitIncomingOperation extends WagoDiagnosticsStoreIngestOperation {
  protected admitIncoming(
    id: number,
    state: RuntimeDiagnostics,
    kind: string,
    data: Record<string, unknown>,
    canonical: boolean,
  ): boolean {
    if (!canonical && kind === 'heartbeat' && typeof data.sequence === 'number') {
      if (data.sequence < (state.legacyHeartbeatSequence ?? 0)) return false;
      state.legacyHeartbeatSequence = data.sequence;
    }
    if (canonical) {
      if (
        kind === 'measurements' &&
        state.measurementAfter !== undefined &&
        (sourceTime(data.timestamp) as number) <= state.measurementAfter
      )
        return false;
      const previousStream = state.activeStream;
      const admission = admitEnvelope(state, data, kind, this.now());
      if (admission === 'rejected') {
        if (state.trackingExhausted) {
          state.connected = false;
          this.controllers.set(id, state);
        }
        return false;
      }
      if (admission === 'restart') {
        // Measurements carry no configuration revision: they must postdate the accepted mapping/connection epoch.
        state.measurementAfter = (sourceTime(data.timestamp) as number) - (previousStream ? 0 : 1);
        state.inputs = Object.create(null);
        state.outputs = Object.create(null);
        state.measurements = Object.create(null);
        state.cumulativeMeasurements = Object.create(null);
        state.connected = undefined;
        state.heartbeatAt = undefined;
        state.rejection = undefined;
        state.hardwareAvailable = undefined;
        state.stateSourceAt = undefined;
        state.manualOutputChannelIds = undefined;
        state.revision = undefined;
        state.contentHash = undefined;
      }
    } else if (state.activeStream && !['heartbeat', 'configuration/reported'].includes(kind)) {
      if (kind === 'state' && data.connected === false) {
        state.connected = false;
        state.measurementAfter = this.now();
        state.stateSourceAt = undefined;
        this.controllers.set(id, state);
      }
      return false;
    }
    return true;
  }
}
