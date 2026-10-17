import type {
  ResourceMeter,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceFlowNode,
  ResourceFlowEdge,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/application-models';
import { operationToken } from '../../../database/transaction-scope';
export class MeterNameConflictError extends Error {}
export type NewMeteringOperation = Pick<
  ResourceMeteringOperation,
  'id' | 'meterId' | 'sessionId' | 'resourceId' | 'kind' | 'status' | 'requestedAt'
> &
  Partial<
    Pick<
      ResourceMeteringOperation,
      'completedAt' | 'reportedValue' | 'readingMode' | 'totalValue' | 'observedAt' | 'source' | 'error'
    >
  >;
export type MeteringOperationUpdate = Partial<
  Pick<
    ResourceMeteringOperation,
    'status' | 'completedAt' | 'reportedValue' | 'readingMode' | 'totalValue' | 'observedAt' | 'source' | 'error'
  >
>;
export type NewMeteringSession = Pick<
  ResourceMeteringSession,
  | 'id'
  | 'resourceId'
  | 'usageId'
  | 'meterId'
  | 'meterName'
  | 'status'
  | 'creditsPerUnit'
  | 'collectionMode'
  | 'latestValue'
>;
export type MeteringSessionUpdate = Partial<
  Pick<
    ResourceMeteringSession,
    | 'status'
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
/** Exact meter values stay strings. Policy, arithmetic, clocks and retries remain in application code. */
export abstract class MeteringPersistence {
  abstract meter(resourceId: number, meterId: number): Promise<ResourceMeter | null>;
  abstract meters(resourceId: number, ordered?: boolean): Promise<ResourceMeter[]>;
  abstract allMeters(): Promise<ResourceMeter[]>;
  abstract resourceExists(resourceId: number): Promise<boolean>;
  abstract createMeter(resourceId: number, name: string): Promise<ResourceMeter>;
  abstract renameMeter(resourceId: number, meterId: number, name: string): Promise<void>;
  abstract setRate(meterId: number, creditsPerUnit: number): Promise<void>;
  abstract updateMeterState(
    meterId: number,
    data: Pick<ResourceMeter, 'counterValue' | 'lifetimeValue' | 'latestObservedAt'>,
  ): Promise<void>;
  abstract flowNodes(resourceId: number): Promise<ResourceFlowNode[]>;
  abstract flowEdges(resourceId: number): Promise<ResourceFlowEdge[]>;
  abstract activeUsage(resourceId: number): Promise<ResourceUsage | null>;
  abstract usage(usageId: number, withUser?: boolean): Promise<ResourceUsage | null>;
  abstract usageStart(usageId: number): Promise<{ startTime: Date } | null>;
  abstract attempt(
    resourceId: number,
  ): Promise<Pick<ResourceUsageLifecycleAttempt, 'id' | 'candidateUsageId' | 'previousUsageId'> | null>;
  abstract hasAttempt(resourceId: number): Promise<boolean>;
  abstract conflictingIdleUsage(
    resourceId: number,
    meterId: number,
    requestedAt: Date,
    activeUsageId: number | null,
  ): Promise<boolean>;
  abstract session(sessionId: string): Promise<ResourceMeteringSession | null>;
  abstract resourceSession(resourceId: number, sessionId: string): Promise<ResourceMeteringSession | null>;
  abstract activeSession(resourceId: number, meterId: number, usageId: number): Promise<ResourceMeteringSession | null>;
  abstract activeSessions(usageId: number, resourceId?: number): Promise<ResourceMeteringSession[]>;
  abstract sessions(usageId: number): Promise<ResourceMeteringSession[]>;
  abstract unsettledSessions(resourceId: number): Promise<ResourceMeteringSession[]>;
  abstract createSession(data: NewMeteringSession): Promise<ResourceMeteringSession>;
  abstract updateSession(sessionId: string, data: MeteringSessionUpdate): Promise<void>;
  abstract deleteSession(sessionId: string): Promise<void>;
  abstract deleteUsageSessions(usageId: number): Promise<void>;
  abstract failEarlierPendingSessions(
    resourceId: number,
    meterId: number,
    usageId: number,
    reason: string,
  ): Promise<void>;
  abstract failPendingSessions(meterId: number, reason: string): Promise<void>;
  abstract compromiseSessions(usageId: number, meterIds: readonly number[], reason: string): Promise<void>;
  abstract newerSessionCount(resourceId: number, meterId: number, usageId: number): Promise<number>;
  abstract waiveSession(resourceId: number, sessionId: string, settledAt: Date): Promise<number>;
  abstract operation(operationId: string): Promise<ResourceMeteringOperation | null>;
  abstract finalOperation(operationId: string, sessionId: string): Promise<ResourceMeteringOperation | null>;
  abstract saveOperation(data: NewMeteringOperation): Promise<ResourceMeteringOperation>;
  abstract updateOperation(operationId: string, data: MeteringOperationUpdate): Promise<void>;
  abstract closePendingOperation(
    operationId: string,
    status: 'failed' | 'expired',
    error: string,
    at: Date,
  ): Promise<void>;
  abstract expirePendingOperations(error: string): Promise<void>;
}
export const METERING_OPERATIONS = operationToken<MeteringPersistence>('resource metering', [
  'meter',
  'meters',
  'allMeters',
  'resourceExists',
  'createMeter',
  'renameMeter',
  'setRate',
  'updateMeterState',
  'flowNodes',
  'flowEdges',
  'activeUsage',
  'usage',
  'usageStart',
  'attempt',
  'hasAttempt',
  'conflictingIdleUsage',
  'session',
  'resourceSession',
  'activeSession',
  'activeSessions',
  'sessions',
  'unsettledSessions',
  'createSession',
  'updateSession',
  'deleteSession',
  'deleteUsageSessions',
  'failEarlierPendingSessions',
  'failPendingSessions',
  'compromiseSessions',
  'newerSessionCount',
  'waiveSession',
  'operation',
  'finalOperation',
  'saveOperation',
  'updateOperation',
  'closePendingOperation',
  'expirePendingOperations',
]);
