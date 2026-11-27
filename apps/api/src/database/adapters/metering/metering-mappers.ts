import type {
  MeteringLifecycleAttempt,
  MeteringUsageRecord,
  ResourceMeterRecord,
  ResourceMeteringOperationRecord,
  ResourceMeteringSegmentRecord,
  ResourceMeteringSessionRecord,
} from '@attraccess/application-models';
import type {
  ResourceMeter,
  ResourceMeteringOperation,
  ResourceMeteringSegment,
  ResourceMeteringSession,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';

/** Rows leave the adapter as plain records of the neutral model, with exactly the fields the model names. */

export const toMeter = (row: ResourceMeter): ResourceMeterRecord => ({
  id: row.id,
  resourceId: row.resourceId,
  name: row.name,
  creditsPerUnit: row.creditsPerUnit,
  allocation: row.allocation,
  lifetimeValue: row.lifetimeValue,
  counterValue: row.counterValue,
  latestObservedAt: row.latestObservedAt,
  archivedAt: row.archivedAt,
});

export const toSession = (row: ResourceMeteringSession): ResourceMeteringSessionRecord => ({
  id: row.id,
  resourceId: row.resourceId,
  usageId: row.usageId,
  status: row.status,
  meterId: row.meterId,
  meterName: row.meterName,
  collectionMode: row.collectionMode,
  creditsPerUnit: row.creditsPerUnit,
  accounting: row.accounting,
  baselineValue: row.baselineValue,
  source: row.source,
  latestValue: row.latestValue,
  latestObservedAt: row.latestObservedAt,
  consumedValue: row.consumedValue,
  chargeCredits: row.chargeCredits,
  finalOperationId: row.finalOperationId,
  failureReason: row.failureReason,
  compromisedReason: row.compromisedReason,
  settledAt: row.settledAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toOperation = (row: ResourceMeteringOperation): ResourceMeteringOperationRecord => ({
  id: row.id,
  meterId: row.meterId,
  sessionId: row.sessionId,
  resourceId: row.resourceId,
  kind: row.kind,
  status: row.status,
  requestedAt: row.requestedAt,
  completedAt: row.completedAt,
  reportedValue: row.reportedValue,
  readingMode: row.readingMode,
  totalValue: row.totalValue,
  observedAt: row.observedAt,
  source: row.source,
  error: row.error,
});

export const toSegment = (row: ResourceMeteringSegment): ResourceMeteringSegmentRecord => ({
  id: row.id,
  resourceId: row.resourceId,
  meterId: row.meterId,
  status: row.status,
  startedAt: row.startedAt,
  endedAt: row.endedAt,
  startValue: row.startValue,
  endValue: row.endValue,
  participants: row.participants,
});

export const toUsage = (row: ResourceUsage): MeteringUsageRecord => ({
  id: row.id,
  resourceId: row.resourceId,
  userId: row.userId,
  startTime: row.startTime,
  endTime: row.endTime,
  meterRates: row.meterRates,
  billingFactor: row.billingFactor,
});

export const toAttempt = (row: ResourceUsageLifecycleAttempt): MeteringLifecycleAttempt => ({
  id: row.id,
  candidateUsageId: row.candidateUsageId,
  previousUsageId: row.previousUsageId,
});
