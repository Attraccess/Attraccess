import { sourceTime } from './diagnostics-envelope';
import { RuntimeDiagnostics } from './diagnostics-store.contracts';
import { CANONICAL_UNITS } from './diagnostics-envelope';
import { safeValidationSummaries } from './diagnostics-validation';
import { DiagnosticAcknowledgement } from './diagnostics-store.contracts';
import { faultCodes } from './diagnostics-store.state';
import { identifier } from './diagnostics-store.helpers';
import { SampleMetadata } from './diagnostics-store.contracts';
import { WagoDiagnosticsStoreApplyStateOperation } from './diagnostics-store.wago-diagnostics-store-apply-state-operation';


export abstract class WagoDiagnosticsStoreApplyEventsOperation extends WagoDiagnosticsStoreApplyStateOperation {
  protected applyEvents(
    id: number,
    state: RuntimeDiagnostics,
    kind: string,
    data: Record<string, unknown>,
    canonical: boolean,
    metadata: SampleMetadata,
  ): void {
    const { receivedAt } = metadata;
    if (
      kind === 'measurements' &&
      identifier(data.channelId) &&
      typeof data.value === 'number' &&
      Number.isFinite(data.value) &&
      (canonical ? CANONICAL_UNITS : ['ampere', 'volt', 'watt', 'percent']).includes(data.unit as string)
    ) {
      const collection = canonical && data.kind === 'cumulative' ? state.cumulativeMeasurements : state.measurements;
      collection[data.channelId] = {
        kind: 'measurement',
        value: data.value,
        unit: data.unit as string,
        ...(canonical ? { measurementKind: data.kind as 'live' | 'cumulative' } : {}),
        ...metadata,
      };
      const fault = state.faults[data.channelId];
      if (
        canonical &&
        fault?.sourceAt &&
        ['measurement_read_failed', 'modbus_read_failed', 'modbus_rtu_quarantined'].includes(fault.code) &&
        (sourceTime(metadata.sourceAt) as number) > (sourceTime(fault.sourceAt) as number)
      )
        delete state.faults[data.channelId];
    }
    if (kind === 'faults' && identifier(data.channelId))
      state.faults[data.channelId] = {
        code: faultCodes.has(data.code as string) ? (data.code as string) : 'runtime_fault',
        receivedAt,
        sourceAt: metadata.sourceAt,
      };
    if (
      kind === 'acknowledgements' &&
      identifier(data.id) &&
      ['accepted', 'duplicate', 'rejected'].includes(data.status as string)
    ) {
      const command = this.commands.get(data.id);
      if (command?.controllerId === id) {
        state.acknowledgements[command.channelId] = {
          id: data.id,
          status: data.status as DiagnosticAcknowledgement['status'],
          receivedAt,
        };
        this.commands.delete(data.id);
      }
    }
    if (
      kind === 'configuration/reported' &&
      Number.isSafeInteger(data.revision) &&
      typeof data.contentHash === 'string'
    )
      state.rejection = {
        revision: data.revision as number,
        contentHash: data.contentHash,
        receivedAt,
        errors: safeValidationSummaries(data.errors),
      };
  }
}
