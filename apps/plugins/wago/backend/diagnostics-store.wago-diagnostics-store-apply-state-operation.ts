import { sourceTime } from './diagnostics-envelope';
import { RuntimeDiagnostics } from './diagnostics-store.contracts';
import { MAX_CHANNELS } from './diagnostics-store.state';
import { identifier } from './diagnostics-store.helpers';
import { isObject } from './diagnostics-store.helpers';
import { SampleMetadata } from './diagnostics-store.contracts';
import { WagoDiagnosticsStoreAdmitIncomingOperation } from './diagnostics-store.wago-diagnostics-store-admit-incoming-operation';


export abstract class WagoDiagnosticsStoreApplyStateOperation extends WagoDiagnosticsStoreAdmitIncomingOperation {
  protected applyState(
    state: RuntimeDiagnostics,
    data: Record<string, unknown>,
    canonical: boolean,
    metadata: SampleMetadata,
  ): void {
    const contentHash =
      typeof data.contentHash === 'string' && /^[0-9a-f]{64}$/i.test(data.contentHash) ? data.contentHash : undefined;
    const hardwareAvailable =
      isObject(data.readiness) && typeof data.readiness.hardwareAvailable === 'boolean'
        ? data.readiness.hardwareAvailable
        : undefined;
    if (
      state.connected !== data.connected ||
      state.revision !== data.revision ||
      state.contentHash !== contentHash ||
      state.hardwareAvailable !== hardwareAvailable
    ) {
      if (state.stateSourceAt || (canonical && state.connected === false))
        state.measurementAfter = canonical ? (sourceTime(data.timestamp) as number) : this.now();
      state.measurements = Object.create(null);
      state.cumulativeMeasurements = Object.create(null);
    }
    state.inputs = Object.create(null);
    state.outputs = Object.create(null);
    if (typeof data.connected === 'boolean') state.connected = data.connected;
    state.revision = Number.isSafeInteger(data.revision) ? (data.revision as number) : undefined;
    state.contentHash = contentHash;
    state.hardwareAvailable = hardwareAvailable;
    state.stateSourceAt = canonical ? (data.timestamp as string) : undefined;
    state.manualOutputChannelIds =
      canonical && Array.isArray(data.manualOutputChannelIds) ? (data.manualOutputChannelIds as string[]) : undefined;
    if (data.outputs && typeof data.outputs === 'object' && !Array.isArray(data.outputs)) {
      for (const [channelId, value] of Object.entries(data.outputs).slice(0, MAX_CHANNELS)) {
        if (identifier(channelId) && typeof value === 'boolean')
          state.outputs[channelId] = { kind: 'output', value, ...metadata };
      }
    }
    if (isObject(data.inputs))
      for (const [channelId, value] of Object.entries(data.inputs).slice(0, MAX_CHANNELS)) {
        if (identifier(channelId) && typeof value === 'boolean')
          state.inputs[channelId] = { kind: 'input', value, ...metadata };
      }
    for (const id of [...Object.keys(state.outputs), ...Object.keys(state.inputs)]) {
      if (['modbus_read_failed', 'digital_read_failed'].includes(state.faults[id]?.code)) delete state.faults[id];
    }
  }
}
