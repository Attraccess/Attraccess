import { ResourceMaintenanceSchedule, ResourceMaintenanceScheduleTriggerType } from '@attraccess/database-entities';
import { registerMaintenanceScheduleEvaluatorServiceFixture } from './maintenance-schedule-evaluator.service.maintenance-schedule-evaluator-service.test-fixture';
export function registerEvaluateResourceCases(
  fixture: ReturnType<typeof registerMaintenanceScheduleEvaluatorServiceFixture>,
) {
  describe('evaluateResource', () => {
    it.each([
      { kind: 'manual', activeScheduleId: null },
      { kind: 'another schedule', activeScheduleId: fixture.scheduleId + 1 },
    ])('does not create a second maintenance while $kind maintenance is active', async ({ activeScheduleId }) => {
      jest
        .spyOn(fixture.scheduleRepository, 'find')
        .mockResolvedValue([
          { id: fixture.scheduleId, resourceId: fixture.resourceId, enabled: true } as ResourceMaintenanceSchedule,
        ]);
      jest.spyOn(fixture.service, 'shouldTrigger').mockResolvedValue(true);
      // The resource has an active record, but it does not belong to the schedule being evaluated.
      jest
        .spyOn(fixture.maintenanceService, 'hasActiveMaintenance')
        .mockImplementation(async (filter) => typeof filter === 'number' || filter.scheduleId === activeScheduleId);

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should not create maintenance when resource has active maintenance', async () => {
      jest.spyOn(fixture.maintenanceService, 'hasActiveMaintenance').mockResolvedValue(true);
      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: fixture.resourceId,
          enabled: true,
          triggerType: 'USAGE_HOURS',
          usageHoursConfig: { duration: 1, unit: 'HOURS' as const },
        } as ResourceMaintenanceSchedule,
      ]);

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should create maintenance when USAGE_HOURS threshold met and no active maintenance', async () => {
      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: fixture.resourceId,
          enabled: true,
          triggerType: 'USAGE_HOURS',
          usageHoursConfig: { duration: 1, unit: 'HOURS' as const },
          usageCountConfig: null,
          timeIntervalConfig: null,
        } as ResourceMaintenanceSchedule,
      ]);

      fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
        new Map([
          [`${fixture.scheduleId}:${fixture.resourceId}`, { sessionDurationMs: 120 * 60_000, operatingDurationMs: 0 }],
        ]),
      );

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        fixture.resourceId,
        fixture.scheduleId,
        expect.any(String),
        expect.anything(),
      );
      const reason = (fixture.maintenanceService.createMaintenanceFromSchedule as jest.Mock).mock.calls[0][2];
      const parsed = JSON.parse(reason);
      expect(parsed.i18nKey).toBe('reason.auto.usageHoursHours');
      expect(parsed.details.duration).toBe(1);
    });

    it('should not create when USAGE_HOURS threshold not met', async () => {
      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: fixture.resourceId,
          enabled: true,
          triggerType: 'USAGE_HOURS',
          usageHoursConfig: { duration: 10, unit: 'HOURS' as const },
          usageCountConfig: null,
          timeIntervalConfig: null,
        } as ResourceMaintenanceSchedule,
      ]);

      fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
        new Map([
          [`${fixture.scheduleId}:${fixture.resourceId}`, { sessionDurationMs: 100 * 60_000, operatingDurationMs: 0 }],
        ]),
      );

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });

    it('should create when TIME_INTERVAL threshold due', async () => {
      const oldBaseline = new Date('2024-12-01T00:00:00.000Z');
      const mantQb = fixture.createQueryBuilderMock();
      mantQb.getOne.mockResolvedValue({ endTime: oldBaseline });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(mantQb as any);

      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: fixture.resourceId,
          enabled: true,
          triggerType: 'TIME_INTERVAL',
          usageHoursConfig: null,
          usageCountConfig: null,
          timeIntervalConfig: { duration: 30, unit: 'DAYS' },
        } as ResourceMaintenanceSchedule,
      ]);

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledWith(
        fixture.resourceId,
        fixture.scheduleId,
        expect.any(String),
        expect.anything(),
      );
      const reason = (fixture.maintenanceService.createMaintenanceFromSchedule as jest.Mock).mock.calls[0][2];
      const parsed = JSON.parse(reason);
      expect(parsed.i18nKey).toBe('reason.auto.timeIntervalDays');
      expect(parsed.details.duration).toBe(30);
    });

    it('should skip disabled schedules', async () => {
      jest.spyOn(fixture.scheduleRepository, 'find').mockResolvedValue([
        {
          id: fixture.scheduleId,
          resourceId: fixture.resourceId,
          enabled: false,
          triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
          usageHoursConfig: { duration: 1, unit: 'MINUTES' as const },
        } as ResourceMaintenanceSchedule,
      ]);

      await fixture.service.evaluateResource(fixture.resourceId);

      expect(fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalled();
    });
  });
}
