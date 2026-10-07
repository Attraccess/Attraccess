import type { DiagnosticStream } from './diagnostics-envelope';
export interface DiagnosticAcknowledgement {
  id: string;
  status: 'accepted' | 'duplicate' | 'rejected' | 'dispatch-failed' | 'timeout';
  receivedAt: string;
}
export interface DiagnosticSample {
  kind: 'input' | 'output' | 'measurement';
  value: boolean | number;
  unit?: string;
  measurementKind?: 'live' | 'cumulative';
  sourceAt: string | null;
  streamId: string | null;
  sequence: number | null;
  receivedAt: string;
}

export interface RuntimeDiagnostics extends DiagnosticStream {
  touched: number;
  heartbeatAt?: string;
  legacyHeartbeatSequence?: number;
  connected?: boolean;
  hardwareAvailable?: boolean;
  revision?: number;
  contentHash?: string;
  stateSourceAt?: string;
  manualOutputChannelIds?: string[];
  measurementAfter?: number;
  inputs: Record<string, DiagnosticSample>;
  outputs: Record<string, DiagnosticSample>;
  measurements: Record<string, DiagnosticSample>;
  cumulativeMeasurements: Record<string, DiagnosticSample>;
  rejection?: {
    revision: number;
    contentHash: string;
    receivedAt: string;
    errors: Array<{ path: string; code: string }>;
  };
  faults: Record<string, { code: string; receivedAt: string; sourceAt: string | null }>;
  acknowledgements: Record<string, DiagnosticAcknowledgement>;
  events: Array<{ kind: string; receivedAt: string }>;
}

export type SampleMetadata = Pick<DiagnosticSample, 'sourceAt' | 'receivedAt' | 'streamId' | 'sequence'>;
