import { ResourceMeter } from './resource-meter';
import { Resource } from './resource';
import { ResourceUsage } from './resourceUsage';

export enum ResourceMeteringSessionStatus {
  /** Metering is initialized; the usage is running (or being started). */
  Active = 'active',
  /** The final total was collected and the meter charge is part of the usage bill. */
  Settled = 'settled',
  /** The usage ended but no valid final total is available yet; retryable. */
  Pending = 'pending',
  /** The final total can no longer be obtained (or was rejected); needs an operator decision. */
  Failed = 'failed',
  /** An operator decided not to charge meter for this usage. */
  Waived = 'waived',
}

export type ResourceMeteringOperationKind = 'start' | 'interim' | 'final';
export type ResourceMeteringOperationStatus = 'pending' | 'completed' | 'failed' | 'expired';

/** Logical metering session: one per usage and meter. Meter values are integer billionths stored as text. */
export interface ResourceMeteringSession {
  id: string;
  resourceId: number;
  resource: Resource;
  usageId: number;
  usage: ResourceUsage;
  status: ResourceMeteringSessionStatus;
  meterId: number;
  meter: ResourceMeter;
  meterName: string;
  /** Collection strategy captured at start, independent of later flow edits. */
  collectionMode: 'requested' | 'increment';
  /** Rate captured when the session started. */
  creditsPerUnit: number;
  /** Set when the start branch reported a lifetime-counter reading to subtract from later totals. */
  baselineValue: string | null;
  source: string | null;
  /** Highest accepted total since the reset, used to reject counter decreases. */
  latestValue: string | null;
  latestObservedAt: Date | null;
  consumedValue: string | null;
  chargeCredits: number | null;
  finalOperationId: string | null;
  failureReason: string | null;
  /** Set when the physical meter may have been reset for a different session; the total is unreliable. */
  compromisedReason: string | null;
  settledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One request/reply to the flow-defined meter; the audit trail behind a charge. */
export interface ResourceMeteringOperation {
  id: string;
  meterId: number;
  meter: ResourceMeter;
  sessionId: string | null;
  session: ResourceMeteringSession;
  resourceId: number;
  kind: ResourceMeteringOperationKind;
  status: ResourceMeteringOperationStatus;
  requestedAt: Date;
  completedAt: Date | null;
  reportedValue: string | null;
  readingMode: 'total' | 'increment' | null;
  /** Total consumed since the session's reset (baseline already subtracted). */
  totalValue: string | null;
  observedAt: Date | null;
  source: string | null;
  error: string | null;
  createdAt: Date;
}
