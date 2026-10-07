import {
  Resource,
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
  ResourceUsage,
  UsageDurationUnit,
} from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { MetricsService } from '../../metrics/metrics.service';
import {
  ResourceDurations,
  ResourceOperatingAttributionService,
} from '../operating-intervals/resource-operating-attribution.service';
import { ResourceMaintenanceService } from './maintenance.service';
export abstract class MaintenanceScheduleEvaluatorServiceRouteContext {
  protected abstract readonly pendingUsageEvals: Map<number, NodeJS.Timeout>;
  protected abstract readonly usageEvalFirstEventAt: Map<number, number>;
  protected abstract readonly maintenanceRepository: Repository<ResourceMaintenance>;
  protected abstract readonly resourceRepository: Repository<Resource>;
  protected abstract readonly usageRepository: Repository<ResourceUsage>;
  protected abstract durationToMs(duration: number, unit: UsageDurationUnit): number;
  public abstract getBaselineDate(resourceId: number, scheduleId: number, manager?: EntityManager): Promise<Date>;
  protected abstract readonly operatingAttributionService: ResourceOperatingAttributionService;
  protected abstract selectedDuration(schedule: ResourceMaintenanceSchedule, durations?: ResourceDurations): number;
  protected abstract getUsageSessionCountSince(
    resourceId: number,
    since: Date,
    manager?: EntityManager,
  ): Promise<number>;
  protected abstract evaluateTriggerThreshold(
    schedule: ResourceMaintenanceSchedule,
    baseline: Date,
    now: Date,
    durationMs: number,
    usageCount: number,
  ): boolean;
  protected abstract readonly scheduleRepository: Repository<ResourceMaintenanceSchedule>;
  protected abstract readonly maintenanceService: ResourceMaintenanceService;
  public abstract shouldTrigger(
    schedule: ResourceMaintenanceSchedule,
    resourceId: number,
    manager?: EntityManager,
  ): Promise<boolean>;
  protected abstract buildMaintenanceReasonFromScheduleDefinition(schedule: ResourceMaintenanceSchedule): string;
  protected abstract readonly logger: Logger;
  protected abstract readonly cronTimer: CronTimer;
  public abstract evaluateAll(): Promise<void>;
  protected abstract queueEvaluation(resourceId: number): void;
  protected abstract readonly usageEvalMaxWaitMs: 30000;
  protected abstract readonly usageEvalDebounceMs: 5000;
  public abstract evaluateResource(resourceId: number): Promise<void>;
  protected abstract readonly metricsService: MetricsService;
  protected abstract evaluationLock: boolean;
  protected abstract loadScheduleResources(
    allSchedules: ResourceMaintenanceSchedule[],
  ): Promise<{ resourceCreatedAtMap: Map<number, Date>; knownResourceIds: Set<number> }>;
  protected abstract loadScheduleState(
    allSchedules: ResourceMaintenanceSchedule[],
    knownResourceIds: Set<number>,
    resourceCreatedAtMap: Map<number, Date>,
    now: Date,
  ): Promise<{
    pairs: {
      resourceId: number;
      scheduleId: number;
      createdAt: Date;
      triggerType: ResourceMaintenanceScheduleTriggerType;
    }[];
    usageCountBySchedule: Map<string, number>;
    baselineMap: Map<string, Date>;
    activeResourceIds: Set<number>;
    getBaseline: (resourceId: number, scheduleId: number) => Date;
  }>;
  protected abstract loadScheduleDurations(
    allSchedules: ResourceMaintenanceSchedule[],
    pairs: Array<{ resourceId: number; scheduleId: number; triggerType: ResourceMaintenanceScheduleTriggerType }>,
    activeResourceIds: Set<number>,
    getBaseline: (resourceId: number, scheduleId: number) => Date,
    baselineMap: Map<string, Date>,
    now: Date,
  ): Promise<Map<string, ResourceDurations>>;
  protected abstract selectTriggeringSchedules(
    allSchedules: ResourceMaintenanceSchedule[],
    knownResourceIds: Set<number>,
    activeResourceIds: Set<number>,
    getBaseline: (resourceId: number, scheduleId: number) => Date,
    durations: Map<string, ResourceDurations>,
    usageCountBySchedule: Map<string, number>,
    now: Date,
  ): Promise<{ resourceId: number; schedule: ResourceMaintenanceSchedule }[]>;
  protected abstract persistTriggeredSchedules(
    toCreate: Array<{ resourceId: number; schedule: ResourceMaintenanceSchedule }>,
  ): Promise<void>;
}
