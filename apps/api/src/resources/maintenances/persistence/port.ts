import { operationToken } from '../../../database/transaction-scope';
import type { ResourceIntroducer, User, ResourceMaintenance } from '@attraccess/application-models';
import type { ResourceMaintenanceRequest, MaintenanceRequestStatus } from '@attraccess/application-models';
import type { Resource, ResourceMaintenanceSchedule, UsageDurationUnit } from '@attraccess/application-models';
export type NewMaintenanceSchedule = Pick<
  ResourceMaintenanceSchedule,
  'resourceId' | 'name' | 'triggerType' | 'durationBasis' | 'enabled'
>;
export abstract class MaintenanceSchedulePersistence {
  abstract resource(resourceId: number): Promise<Resource | null>;
  abstract schedules(resourceId: number): Promise<ResourceMaintenanceSchedule[]>;
  abstract schedule(resourceId: number, scheduleId: number): Promise<ResourceMaintenanceSchedule | null>;
  abstract createSchedule(schedule: NewMaintenanceSchedule): Promise<ResourceMaintenanceSchedule>;
  abstract saveSchedule(schedule: ResourceMaintenanceSchedule): Promise<void>;
  abstract removeConfigurations(scheduleId: number): Promise<void>;
  abstract createUsageHours(scheduleId: number, duration: number, unit: UsageDurationUnit): Promise<void>;
  abstract createUsageCount(scheduleId: number, thresholdSessions: number): Promise<void>;
  abstract createTimeInterval(scheduleId: number, duration: number, unit: UsageDurationUnit): Promise<void>;
  abstract deleteAndDetachSchedule(schedule: ResourceMaintenanceSchedule): Promise<void>;
}

export abstract class MaintenanceRequestPersistence {
  abstract resource(resourceId: number): Promise<Resource | null>;
  abstract createRequest(
    resource: Resource,
    userId: number,
    reason: string,
    status: MaintenanceRequestStatus,
  ): Promise<ResourceMaintenanceRequest>;
  abstract requestPage(
    resourceId: number,
    page: number,
    limit: number,
    status: MaintenanceRequestStatus,
  ): Promise<[ResourceMaintenanceRequest[], number]>;
  abstract requestWithRelations(id: number): Promise<ResourceMaintenanceRequest | null>;
  abstract saveRequest(request: ResourceMaintenanceRequest): Promise<ResourceMaintenanceRequest>;
}

export abstract class MaintenanceRequestRecipients {
  abstract requestWithAuthor(id: number): Promise<ResourceMaintenanceRequest | null>;
  abstract resourceWithGroups(id: number): Promise<Resource | null>;
  abstract usersByIds(ids: readonly number[]): Promise<User[]>;
  abstract introducers(resourceId: number, groupIds: readonly number[]): Promise<ResourceIntroducer[]>;
}

export interface MaintenancePageFilter {
  now: Date;
  includeUpcoming: boolean;
  includeActive: boolean;
  includePast: boolean;
  skip: number;
  take: number;
}
export interface NewMaintenance {
  resource: Resource;
  startTime: Date;
  endTime: Date | null;
  reason: string | null;
  createdByUser?: Pick<User, 'id'>;
  maintenanceSchedule?: Pick<ResourceMaintenanceSchedule, 'id'>;
}
export abstract class MaintenancePersistence {
  abstract resource(id: number, withGroups?: boolean): Promise<Resource | null>;
  abstract maintenance(id: number, withAuditUsers: boolean): Promise<ResourceMaintenance | null>;
  abstract page(resourceId: number, filter: MaintenancePageFilter): Promise<[ResourceMaintenance[], number]>;
  abstract hasActive(resourceId: number, scheduleId: number | undefined, now: Date): Promise<boolean>;
  abstract activeResourceIds(resourceIds: readonly number[], now: Date): Promise<number[]>;
  abstract managedResourcePairs(
    userId: number,
    resourceIds: readonly number[],
  ): Promise<{ resourceId: number | null; groupResourceId: number | null }[]>;
  abstract directIntroducer(userId: number, resourceId: number): Promise<boolean>;
  abstract groupIntroducer(userId: number, groupIds: readonly number[]): Promise<boolean>;
  abstract createMaintenance(data: NewMaintenance): Promise<ResourceMaintenance>;
  abstract saveMaintenance(data: ResourceMaintenance): Promise<ResourceMaintenance>;
}
export const MAINTENANCE_OPERATIONS = operationToken<MaintenancePersistence>('maintenance access and state', [
  'resource',
  'maintenance',
  'page',
  'hasActive',
  'activeResourceIds',
  'managedResourcePairs',
  'directIntroducer',
  'groupIntroducer',
  'createMaintenance',
  'saveMaintenance',
]);

export interface ScheduleEvaluationPair {
  resourceId: number;
  scheduleId: number;
  createdAt: Date;
}
export interface ScheduleEvaluationRow {
  resourceId: number;
  scheduleId: number;
  baseline: Date | null;
  hasActiveMaintenance: boolean;
  totalCount?: number;
}
/** A failed storage isolation boundary aborts the whole batch, never just one candidate. */
export class MaintenanceBatchIsolationError extends Error {}
export abstract class MaintenanceEvaluationPersistence {
  abstract enabledSchedules(resourceId?: number): Promise<ResourceMaintenanceSchedule[]>;
  abstract resourceCreationDate(id: number): Promise<Date | null>;
  abstract resourceCreationDates(ids: readonly number[]): Promise<{ id: number; createdAt: Date }[]>;
  abstract lastCompleted(resourceId: number, scheduleId: number): Promise<Date | null>;
  abstract usageCount(resourceId: number, since: Date): Promise<number>;
  abstract scheduleState(
    pairs: readonly ScheduleEvaluationPair[],
    now: Date,
    includeUsageCount: boolean,
  ): Promise<ScheduleEvaluationRow[]>;
  /** The batch owns the transaction; only this candidate's database changes may be discarded. No effects or commit callbacks inside. */
  abstract attemptCreation(resourceId: number, create: () => Promise<number | undefined>): Promise<number | undefined>;
}
export const MAINTENANCE_EVALUATION_OPERATIONS = operationToken<MaintenanceEvaluationPersistence>(
  'maintenance evaluation',
  ['enabledSchedules', 'resourceCreationDate', 'resourceCreationDates', 'lastCompleted', 'usageCount', 'scheduleState', 'attemptCreation'],
);
