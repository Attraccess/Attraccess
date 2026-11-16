import {
  MaintenanceRequestStatus,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
  UsageDurationUnit,
  type ResourceActorUser,
} from '@attraccess/application-models';
import { toMaintenanceRequestDto, toMaintenanceScheduleDto } from './maintenance-records.mapper';

const at = new Date('2030-01-01T00:00:00Z');
const user = { id: 1, username: 'alice', email: 'secret@example.test' } as unknown as ResourceActorUser;

describe('maintenance record mappers', () => {
  it('copies only the response fields of a schedule and keeps unloaded configs apart from absent ones', () => {
    const dto = toMaintenanceScheduleDto({
      id: 1,
      createdAt: at,
      updatedAt: at,
      resourceId: 2,
      name: null,
      triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
      durationBasis: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION,
      enabled: true,
      usageHoursConfig: { id: 3, scheduleId: 1, duration: 5, unit: UsageDurationUnit.HOURS, extra: 1 } as never,
      usageCountConfig: null,
    });

    expect(dto.usageHoursConfig).toEqual({ id: 3, scheduleId: 1, duration: 5, unit: UsageDurationUnit.HOURS });
    expect(dto.usageCountConfig).toBeNull();
    expect(dto.timeIntervalConfig).toBeUndefined();
  });

  it('maps a request with its users and resulting maintenance, never the e-mail address', () => {
    const dto = toMaintenanceRequestDto({
      id: 1,
      createdAt: at,
      updatedAt: at,
      resourceId: 2,
      reason: 'noise',
      status: MaintenanceRequestStatus.RESOLVED,
      resolvedAt: at,
      createdByUser: user,
      resolvedByUser: null,
      resultingMaintenance: {
        id: 9,
        createdAt: at,
        updatedAt: at,
        resourceId: 2,
        startTime: at,
        endTime: null,
        reason: null,
        completedAt: null,
      },
    });

    expect(dto.createdByUser).toMatchObject({ id: 1, username: 'alice' });
    expect(JSON.stringify(dto)).not.toContain('example.test');
    expect(dto.resolvedByUser).toBeNull();
    expect(dto.resultingMaintenance?.id).toBe(9);
  });

  it('maps an absent resulting maintenance to null', () => {
    const dto = toMaintenanceRequestDto({
      id: 1,
      createdAt: at,
      updatedAt: at,
      resourceId: 2,
      reason: 'x',
      status: MaintenanceRequestStatus.OPEN,
      resolvedAt: null,
      resultingMaintenance: null,
    });
    expect(dto.resultingMaintenance).toBeNull();
  });
});
