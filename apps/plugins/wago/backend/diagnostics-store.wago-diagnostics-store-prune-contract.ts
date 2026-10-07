import { RuntimeDiagnostics } from './diagnostics-store.contracts';
import { SampleMetadata } from './diagnostics-store.contracts';


export abstract class WagoDiagnosticsStorePruneContract {
  protected abstract prune(): void;
  abstract read(id: number): RuntimeDiagnostics;
  abstract command(controllerId: number, channelId: string, id: string): void;
  abstract commandFailed(id: string, status: 'dispatch-failed' | 'timeout'): void;
  abstract canTrack(id: number): boolean;
  abstract ingest(id: number, kind: string, payload: Buffer): boolean;
  protected abstract admitIncoming(
    id: number,
    state: RuntimeDiagnostics,
    kind: string,
    data: Record<string, unknown>,
    canonical: boolean,
  ): boolean;
  protected abstract applyState(
    state: RuntimeDiagnostics,
    data: Record<string, unknown>,
    canonical: boolean,
    metadata: SampleMetadata,
  ): void;
  protected abstract applyEvents(
    id: number,
    state: RuntimeDiagnostics,
    kind: string,
    data: Record<string, unknown>,
    canonical: boolean,
    metadata: SampleMetadata,
  ): void;
}
