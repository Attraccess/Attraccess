import { ResourceMaintenanceScheduleTriggerType, UsageDurationUnit } from '@attraccess/database-entities';
import { MaintenanceScheduleWritingImplementation } from './maintenance-schedule-writing';
export abstract class MaintenanceScheduleConfigImplementation extends MaintenanceScheduleWritingImplementation {
  protected async removeConfigsForSchedule(scheduleId: number): Promise<void> {
    await this.usageHoursConfigRepository.delete({ scheduleId });
    await this.usageCountConfigRepository.delete({ scheduleId });
    await this.timeIntervalConfigRepository.delete({ scheduleId });
  }

  protected async upsertConfigForSchedule(
    scheduleId: number,
    triggerType: ResourceMaintenanceScheduleTriggerType,
    configs: {
      usageHoursConfig?: { duration: number; unit: UsageDurationUnit };
      usageCountConfig?: { thresholdSessions: number };
      timeIntervalConfig?: { duration: number; unit: UsageDurationUnit };
    },
  ): Promise<void> {
    switch (triggerType) {
      case ResourceMaintenanceScheduleTriggerType.USAGE_HOURS:
        if (configs.usageHoursConfig) {
          await this.usageHoursConfigRepository.save(
            this.usageHoursConfigRepository.create({
              scheduleId,
              duration: configs.usageHoursConfig.duration,
              unit: configs.usageHoursConfig.unit,
            }),
          );
        }
        break;
      case ResourceMaintenanceScheduleTriggerType.USAGE_COUNT:
        if (configs.usageCountConfig) {
          await this.usageCountConfigRepository.save(
            this.usageCountConfigRepository.create({
              scheduleId,
              thresholdSessions: configs.usageCountConfig.thresholdSessions,
            }),
          );
        }
        break;
      case ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL:
        if (configs.timeIntervalConfig) {
          const { duration, unit } = configs.timeIntervalConfig;
          await this.timeIntervalConfigRepository.save(
            this.timeIntervalConfigRepository.create({
              scheduleId,
              duration,
              unit,
            }),
          );
        }
        break;
    }
  }
}
