export type Freshness = 'missing' | 'invalid' | 'future' | 'stale' | 'fresh';
export interface DiagnosticValue {
  kind: 'input' | 'output' | 'measurement';
  value: boolean | number;
  unit?: string;
  measurementKind?: 'live' | 'cumulative';
  sourceAt: string | null;
  receivedAt: string;
  streamId: string | null;
  sequence: number | null;
}
export interface DiagnosticChannelValue extends DiagnosticValue {
  sourceFreshness: Freshness;
  current: boolean;
  availabilityReason: string;
}
export interface WagoDiagnostics {
  controllerId: number;
  generatedAt: string;
  name: string;
  connectivity: string;
  heartbeatAt: string | null;
  heartbeatFreshness: Freshness;
  runtimeVersion: string;
  protocolVersion: string;
  capabilities: string[];
  incompatible: boolean;
  sequenceGaps: number | null;
  activeStream: string | null;
  trackingExhausted: boolean;
  stateConnected: boolean | null;
  stateHardwareAvailable: boolean | null;
  stateSourceAt: string | null;
  sequenceExplanation: string;
  configuration: {
    draftUpdatedAt: string | null;
    draftChanged: boolean;
    validationErrorCount: number;
    validationCodes: string[];
    validationErrors: Array<{ path: string; code: string }>;
    rejectionErrors: Array<{ path: string; code: string }>;
    publishedRevision: number | null;
    publishedState: string | null;
    appliedRevision: number | null;
    reportedRevision: number | null;
    revisionMismatch: boolean;
    rejected: boolean;
  };
  hardwareReadiness: 'unknown';
  hardwareReadinessReason: string;
  channels: Array<{
    id: string;
    profile: string;
    capabilities: string[];
    disconnectPolicy: { mode: string; timeoutMs?: number };
    safeState: string;
    samples: DiagnosticChannelValue[];
    current: boolean;
    fault: { code: string; receivedAt: string } | null;
    acknowledgement: {
      id: string;
      status: 'accepted' | 'duplicate' | 'rejected' | 'dispatch-failed' | 'timeout';
      receivedAt: string;
    } | null;
  }>;
  faults: Array<{ channelId: string; code: string; receivedAt: string }>;
  references: Array<{
    nodeId: string;
    resourceId: number;
    channelId: string;
    control: boolean;
    href: string;
    invalid: boolean;
    conflict: boolean;
  }>;
  referencesTruncated: boolean;
  events: Array<{ kind: string; receivedAt: string }>;
  limitations: string[];
}
