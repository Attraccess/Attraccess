import type {
  MaintenanceScheduleRecord,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
  ResourceType,
  UsageDurationUnit,
} from '@attraccess/application-models';
import type { AuditEvent } from '../../audit/recorder/audit-event';

export const MAINTENANCE_SCHEDULE_STORE = Symbol.for('attraccess.resources.maintenance-schedule-store');

/** The trigger configuration a schedule stores for its trigger type. Only the matching one is written. */
export interface MaintenanceScheduleConfigs {
  usageHoursConfig?: { duration: number; unit: UsageDurationUnit };
  usageCountConfig?: { thresholdSessions: number };
  timeIntervalConfig?: { duration: number; unit: UsageDurationUnit };
}

export interface NewMaintenanceSchedule {
  resourceId: number;
  name: string | null;
  triggerType: ResourceMaintenanceScheduleTriggerType;
  durationBasis: ResourceMaintenanceScheduleDurationBasis;
  enabled: boolean;
  configs: MaintenanceScheduleConfigs;
}

export interface MaintenanceSchedulePatch {
  name?: string | null;
  enabled?: boolean;
  durationBasis?: ResourceMaintenanceScheduleDurationBasis;
  triggerType?: ResourceMaintenanceScheduleTriggerType;
}

/** Recurring maintenance schedules of resources with their trigger configurations. */
export interface MaintenanceScheduleStore {
  findResourceType(resourceId: number): Promise<{ type: ResourceType } | null>;

  listForResource(resourceId: number): Promise<MaintenanceScheduleRecord[]>;

  findOne(resourceId: number, scheduleId: number): Promise<MaintenanceScheduleRecord | null>;

  /** Stores the schedule and the config of its trigger type together. Returns the new id. */
  create(schedule: NewMaintenanceSchedule): Promise<number>;

  /**
   * Applies the patch and, when `replaceConfigs` is given, drops every trigger config of the schedule and stores
   * the ones of that trigger type, all together.
   */
  update(
    scheduleId: number,
    patch: MaintenanceSchedulePatch,
    replaceConfigs?: { triggerType: ResourceMaintenanceScheduleTriggerType; configs: MaintenanceScheduleConfigs },
  ): Promise<void>;

  /**
   * Deletes the schedule, its configs and the link of the maintenances it created, and records the audit event in
   * the same transaction, so the deletion is never stored without its audit trail.
   */
  deleteWithAudit(scheduleId: number, auditEvent: AuditEvent): Promise<void>;
}
