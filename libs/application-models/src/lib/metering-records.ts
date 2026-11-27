import type { BillingAllocationRecord } from './billing-ledger';
import type { BillingTransactionStatus } from './billing-transaction';
import type { ResourceMeteringSessionStatus } from './resource-metering';
import type { UsageMeterRate } from './usage-session';

/** Neutral records of the metering area. Meter values are integer billionths stored as text. */

/** How a meter's consumption is assigned when several sessions run on the machine at once. */
export type MeterAllocationKind = 'shared' | 'per-session';

/** `boundary` is a reading at a session start or stop of a shared meter: it closes a time segment. */
export type MeteringOperationKind = 'start' | 'interim' | 'final' | 'boundary';

export type MeteringOperationStatus = 'pending' | 'completed' | 'failed' | 'expired';

export type MeteringSegmentStatus = 'open' | 'closed' | 'abandoned';

export type ResourceMeteringAccounting = 'own' | 'segmented' | 'per-session';

export type ResourceMeteringCollectionMode = 'requested' | 'increment';

export interface ResourceMeterRecord {
  id: number;
  resourceId: number;
  name: string;
  creditsPerUnit: number;
  allocation: MeterAllocationKind;
  lifetimeValue: string;
  counterValue: string | null;
  latestObservedAt: Date | null;
  archivedAt: Date | null;
}

/** Logical metering session: one per usage and meter. */
export interface ResourceMeteringSessionRecord {
  id: string;
  resourceId: number;
  usageId: number;
  status: ResourceMeteringSessionStatus;
  meterId: number;
  meterName: string;
  collectionMode: ResourceMeteringCollectionMode;
  creditsPerUnit: number;
  accounting: ResourceMeteringAccounting;
  baselineValue: string | null;
  source: string | null;
  latestValue: string | null;
  latestObservedAt: Date | null;
  consumedValue: string | null;
  chargeCredits: number | null;
  finalOperationId: string | null;
  failureReason: string | null;
  compromisedReason: string | null;
  settledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** What a new metering session needs; everything else starts empty. */
export type NewResourceMeteringSession = Pick<
  ResourceMeteringSessionRecord,
  'id' | 'resourceId' | 'usageId' | 'meterId' | 'meterName' | 'status' | 'creditsPerUnit' | 'accounting'
> &
  Partial<Pick<ResourceMeteringSessionRecord, 'collectionMode' | 'latestValue'>>;

/** The fields of a metering session that change over its life. */
export type ResourceMeteringSessionPatch = Partial<
  Pick<
    ResourceMeteringSessionRecord,
    | 'status'
    | 'accounting'
    | 'baselineValue'
    | 'source'
    | 'latestValue'
    | 'latestObservedAt'
    | 'consumedValue'
    | 'chargeCredits'
    | 'finalOperationId'
    | 'failureReason'
    | 'compromisedReason'
    | 'settledAt'
  >
>;

/** One request/reply to the flow-defined meter; the audit trail behind a charge. */
export interface ResourceMeteringOperationRecord {
  id: string;
  meterId: number;
  sessionId: string | null;
  resourceId: number;
  kind: MeteringOperationKind;
  status: MeteringOperationStatus;
  requestedAt: Date;
  completedAt: Date | null;
  reportedValue: string | null;
  readingMode: 'total' | 'increment' | null;
  /** Total consumed since the session's reset (baseline already subtracted). */
  totalValue: string | null;
  observedAt: Date | null;
  source: string | null;
  error: string | null;
}

export type NewResourceMeteringOperation = Pick<
  ResourceMeteringOperationRecord,
  'id' | 'meterId' | 'sessionId' | 'resourceId' | 'kind' | 'status' | 'requestedAt'
> &
  Partial<
    Pick<
      ResourceMeteringOperationRecord,
      'completedAt' | 'reportedValue' | 'readingMode' | 'totalValue' | 'observedAt' | 'source'
    >
  >;

export type ResourceMeteringOperationPatch = Partial<
  Pick<
    ResourceMeteringOperationRecord,
    'status' | 'completedAt' | 'reportedValue' | 'readingMode' | 'totalValue' | 'observedAt' | 'source' | 'error'
  >
>;

/** A session taking part in a shared segment, with the rate it captured for the meter. Earliest started first. */
export interface MeteringSegmentParticipant {
  usageId: number;
  creditsPerUnit: number;
}

/** A time span of a shared meter in which the same sessions were active. */
export interface ResourceMeteringSegmentRecord {
  id: string;
  resourceId: number;
  meterId: number;
  status: MeteringSegmentStatus;
  startedAt: Date;
  endedAt: Date | null;
  /** Meter counter at the opening boundary. */
  startValue: string;
  endValue: string | null;
  participants: MeteringSegmentParticipant[];
}

export type ResourceMeteringSegmentPatch = Partial<
  Pick<ResourceMeteringSegmentRecord, 'status' | 'endedAt' | 'endValue' | 'participants'>
>;

/** A usage session as metering needs it. */
export interface MeteringUsageRecord {
  id: number;
  resourceId: number;
  userId: number | null;
  startTime: Date;
  endTime: Date | null;
  meterRates: UsageMeterRate[] | null;
  billingFactor: number | null;
}

/** A usage with the billing factor of its user, for charging a late meter correction. */
export interface MeteringBillableUsage extends MeteringUsageRecord {
  userBillingFactor: number;
}

/** The flow nodes and edges that define a resource's meters. */
interface MeteringFlowNodeRecord {
  id: string;
  type: string;
  data: Record<string, unknown> | null;
}

interface MeteringFlowEdgeRecord {
  source: string;
  target: string;
}

export interface MeteringDefinitionFlow {
  allNodes: MeteringFlowNodeRecord[];
  edges: MeteringFlowEdgeRecord[];
}

/** The lifecycle attempt of a session change, as far as readings need it. */
export interface MeteringLifecycleAttempt {
  id: string;
  candidateUsageId: number | null;
  previousUsageId: number | null;
}

/** A line to add to a usage's bill or a correction. */
export interface MeteringBillItemDraft {
  name: string;
  description: string | null;
  externalReference: string;
  unitPrice: number;
  quantity: number;
  meterQuantity?: string | null;
  meterCreditsPerUnit?: number | null;
  allocation?: BillingAllocationRecord | null;
}

export interface MeteringCorrectionDraft {
  userId: number;
  initiatorId: number | null;
  correctionOfId: number;
  amount: number;
}

export interface MeteringCorrectionRecord {
  id: number;
  userId: number;
  amount: number;
  status: BillingTransactionStatus;
}
