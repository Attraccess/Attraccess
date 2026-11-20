import type { ResourceMaintenanceRecord } from '@attraccess/application-models';
import type { ResourcePersistenceContext } from '../resource-persistence-context';

export const RESOURCE_MAINTENANCE_STORE = Symbol.for('attraccess.resources.maintenance-store');

export interface MaintenancePageFilter {
  includeUpcoming: boolean;
  includeActive: boolean;
  includePast: boolean;
  now: Date;
  skip: number;
  take: number;
}

/** Why a user may manage a resource's maintenance, or that the resource is gone. */
export type MaintenanceAccessLookup = 'direct' | 'group' | 'none' | 'resource-missing';

export interface CreateManualMaintenanceInput {
  resourceId: number;
  startTime: Date;
  endTime: Date | null;
  reason: string | null;
  createdByUserId?: number;
}

export interface CreateScheduledMaintenanceInput {
  resourceId: number;
  scheduleId: number;
  reason: string;
  startTime: Date;
}

/** Maintenance records of resources and the introducer relations that decide who may manage them. */
export interface ResourceMaintenanceStore {
  resourceExists(resourceId: number): Promise<boolean>;

  /** Maintenances of a resource, soonest start first, with the users that created and completed them. */
  page(
    resourceId: number,
    filter: MaintenancePageFilter,
  ): Promise<{ data: ResourceMaintenanceRecord[]; total: number }>;

  findById(maintenanceId: number): Promise<ResourceMaintenanceRecord | null>;

  /** Maintenances whose window [startTime, endTime ?? infinity) overlaps [from, to), soonest first. */
  findOverlapping(resourceId: number, from: Date, to: Date): Promise<ResourceMaintenanceRecord[]>;

  /** True when a maintenance of the resource (optionally of one schedule) started and has no end yet. */
  hasActive(
    filter: { resourceId: number; scheduleId?: number },
    now: Date,
    context?: ResourcePersistenceContext,
  ): Promise<boolean>;

  /** The resources of the list that have a maintenance which started and has no end yet. */
  activeResourceIds(resourceIds: number[], now: Date): Promise<Set<number>>;

  /** The resources of the list a user is introducer or maintainer of, directly or through a group. */
  introducerManagedResourceIds(
    userId: number,
    resourceIds: number[],
    context?: ResourcePersistenceContext,
  ): Promise<Set<number>>;

  /** Whether the user holds an introducer grant on the resource (checked first) or one of its groups. */
  lookupMaintenanceAccess(
    userId: number,
    resourceId: number,
    context?: ResourcePersistenceContext,
  ): Promise<MaintenanceAccessLookup>;

  createManual(input: CreateManualMaintenanceInput): Promise<ResourceMaintenanceRecord>;

  /** Null when the resource does not exist. */
  createFromSchedule(
    input: CreateScheduledMaintenanceInput,
    context?: ResourcePersistenceContext,
  ): Promise<ResourceMaintenanceRecord | null>;

  markFinished(
    maintenanceId: number,
    completedAt: Date,
    completedByUserId?: number,
  ): Promise<ResourceMaintenanceRecord>;
}
