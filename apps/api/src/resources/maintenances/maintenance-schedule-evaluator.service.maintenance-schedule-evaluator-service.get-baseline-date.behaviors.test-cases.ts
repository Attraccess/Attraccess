import { registerMaintenanceScheduleEvaluatorServiceFixture } from './maintenance-schedule-evaluator.service.maintenance-schedule-evaluator-service.test-fixture';
import { ResourceMaintenanceChangedEvent } from './events/resource-maintenance-changed.event';
import {
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
} from '@attraccess/database-entities';

export function registerGetBaselineDateCases(
  fixture: ReturnType<typeof registerMaintenanceScheduleEvaluatorServiceFixture>,
) {
  describe('getBaselineDate', () => {
    it('should return resource createdAt when no previous maintenance for schedule', async () => {
      const result = await fixture.service.getBaselineDate(fixture.resourceId, fixture.scheduleId);
      expect(result).toEqual(fixture.baselineDate);
    });

    it('should return last maintenance endTime when exists', async () => {
      const lastEnd = new Date('2025-02-01T12:00:00.000Z');
      const mockQb = fixture.createQueryBuilderMock();
      mockQb.getOne.mockResolvedValue({ endTime: lastEnd });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(mockQb as any);

      const result = await fixture.service.getBaselineDate(fixture.resourceId, fixture.scheduleId);
      expect(result).toEqual(lastEnd);
    });
  });
}

export function registerOnMaintenanceChangedCases(
  fixture: ReturnType<typeof registerMaintenanceScheduleEvaluatorServiceFixture>,
) {
  describe('onMaintenanceChanged', () => {
    it('should call evaluateResource when maintenance changed (e.g. marked done)', async () => {
      const evalSpy = jest.spyOn(fixture.service, 'evaluateResource').mockResolvedValue();
      const event = new ResourceMaintenanceChangedEvent(fixture.resourceId, 99);

      fixture.service.onMaintenanceChanged(event);
      await new Promise((resolve) => setImmediate(resolve));

      expect(evalSpy).toHaveBeenCalledWith(fixture.resourceId);
    });

    it('should not call evaluateResource when resourceId is null', async () => {
      const evalSpy = jest.spyOn(fixture.service, 'evaluateResource').mockResolvedValue();
      const event = new ResourceMaintenanceChangedEvent(null as never, 99);

      fixture.service.onMaintenanceChanged(event);
      await new Promise((resolve) => setImmediate(resolve));

      expect(evalSpy).not.toHaveBeenCalled();
    });
  });
}

export function registerSelectsTotalOperatingDurationIndependentlyOfSessionDurationCases(
  fixture: ReturnType<typeof registerMaintenanceScheduleEvaluatorServiceFixture>,
) {
  it('selects total operating duration independently of session duration', async () => {
    fixture.operatingAttribution.getDurationsForWindows.mockResolvedValue(
      new Map([
        [`${fixture.scheduleId}:${fixture.resourceId}`, { sessionDurationMs: 0, operatingDurationMs: 60 * 60_000 }],
      ]),
    );
    const triggered = await fixture.service.shouldTrigger(
      {
        id: fixture.scheduleId,
        resourceId: fixture.resourceId,
        triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
        durationBasis: ResourceMaintenanceScheduleDurationBasis.ATTRIBUTABLE_OPERATING_DURATION,
        usageHoursConfig: { duration: 1, unit: 'HOURS' as const },
      } as ResourceMaintenanceSchedule,
      fixture.resourceId,
    );
    expect(triggered).toBe(true);
    expect(fixture.operatingAttribution.getDurationsForWindows).toHaveBeenCalledWith(
      [
        {
          key: `${fixture.scheduleId}:${fixture.resourceId}`,
          resourceId: fixture.resourceId,
          start: fixture.baselineDate,
        },
      ],
      expect.any(Date),
      undefined,
    );
  });
}

export function registerShouldBeDefinedCases(
  fixture: ReturnType<typeof registerMaintenanceScheduleEvaluatorServiceFixture>,
) {
  it('should be defined', () => {
    expect(fixture.service).toBeDefined();
  });
}
