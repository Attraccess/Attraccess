import { operationToken } from '../../../database/transaction-scope';
import type {
  ResourceFlowNodeType,
  ResourceOperatingInterval,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/application-models';
export abstract class OperatingDiagnosticsPersistence {
  abstract openInterval(resourceId: number): Promise<ResourceOperatingInterval | null>;
  abstract latestInterval(resourceId: number): Promise<ResourceOperatingInterval | null>;
  abstract intervalPage(
    resourceId: number,
    page: number,
    limit: number,
  ): Promise<[ResourceOperatingInterval[], number]>;
  abstract trackingNodeCount(resourceId: number, types: readonly ResourceFlowNodeType[]): Promise<number>;
  abstract recentTransitions(resourceId: number, from: Date): Promise<ResourceOperatingInterval[]>;
  abstract openIntervalCount(resourceId: number): Promise<number>;
  abstract overlappingWindow(resourceId: number, from: Date, to: Date): Promise<ResourceOperatingInterval[]>;
}

export type NewOperatingInterval = Pick<
  ResourceOperatingInterval,
  'resourceId' | 'startTime' | 'endTime' | 'startFlowNodeId' | 'startFlowRunId' | 'endFlowNodeId' | 'endFlowRunId'
>;
export class OpenOperatingIntervalConflictError extends Error {}
export interface OperatingIntervalOperations {
  lockResource(resourceId: number): Promise<void>;
  latestInterval(resourceId: number): Promise<ResourceOperatingInterval | null>;
  saveInterval(interval: ResourceOperatingInterval): Promise<ResourceOperatingInterval>;
  createInterval(interval: NewOperatingInterval): Promise<ResourceOperatingInterval>;
}
export const OPERATING_INTERVAL_WRITES = operationToken<OperatingIntervalOperations>('operating-interval-writes', [
  'lockResource',
  'latestInterval',
  'saveInterval',
  'createInterval',
]);

export type OperatingDurationRow = Pick<ResourceOperatingInterval, 'resourceId' | 'startTime' | 'endTime'>;
export type UsageDurationRow = Pick<ResourceUsage, 'id' | 'resourceId' | 'startTime' | 'endTime'>;
export abstract class OperatingAttributionPersistence {
  abstract intervals(
    resourceIds: readonly number[],
    asOf: Date,
    windowStart: Date,
  ): Promise<ResourceOperatingInterval[]>;
  abstract usages(resourceIds: readonly number[], asOf: Date, windowStart: Date): Promise<ResourceUsage[]>;
  abstract hasData(resourceId: number): Promise<boolean>;
  abstract resourcesWithData(resourceIds: readonly number[]): Promise<number[]>;
  abstract pendingEnds(
    resourceIds: readonly number[],
  ): Promise<Pick<ResourceUsageLifecycleAttempt, 'previousUsageId' | 'transitionTime'>[]>;
  abstract durationRows(
    boundaries: readonly { resourceId: number; start: Date }[],
    asOf: Date,
  ): Promise<{ intervals: OperatingDurationRow[]; usages: UsageDurationRow[] }>;
}
export const OPERATING_ATTRIBUTION_READS = operationToken<OperatingAttributionPersistence>('operating attribution', [
  'intervals',
  'usages',
  'hasData',
  'resourcesWithData',
  'pendingEnds',
  'durationRows',
]);
