import {
  Resource,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  ResourceMaintenanceScheduleTriggerType,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleUsageHoursConfig,
  UsageDurationUnit,
} from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';
export abstract class MaintenanceScheduleServiceRouteContext {
  protected abstract ensureResourceExists(resourceId: number): Promise<Resource>;
  protected abstract validateDurationBasis(resource: Resource, basis?: ResourceMaintenanceScheduleDurationBasis): void;
  protected abstract readonly scheduleRepository: Repository<ResourceMaintenanceSchedule>;
  protected abstract upsertConfigForSchedule(
    scheduleId: number,
    triggerType: ResourceMaintenanceScheduleTriggerType,
    configs: {
      usageHoursConfig?: { duration: number; unit: UsageDurationUnit };
      usageCountConfig?: { thresholdSessions: number };
      timeIntervalConfig?: { duration: number; unit: UsageDurationUnit };
    },
  ): Promise<void>;
  public abstract getOne(resourceId: number, scheduleId: number): Promise<ResourceMaintenanceSchedule>;
  protected abstract readonly audit: AuditService;
  protected abstract scheduleDetails(schedule: ResourceMaintenanceSchedule): Record<string, string | number>;
  protected abstract readonly evaluator: MaintenanceScheduleEvaluatorService;
  protected abstract removeConfigsForSchedule(scheduleId: number): Promise<void>;
  protected abstract readonly resourceRepository: Repository<Resource>;
  protected abstract readonly usageHoursConfigRepository: Repository<ResourceMaintenanceScheduleUsageHoursConfig>;
  protected abstract readonly usageCountConfigRepository: Repository<ResourceMaintenanceScheduleUsageCountConfig>;
  protected abstract readonly timeIntervalConfigRepository: Repository<ResourceMaintenanceScheduleTimeIntervalConfig>;
}
