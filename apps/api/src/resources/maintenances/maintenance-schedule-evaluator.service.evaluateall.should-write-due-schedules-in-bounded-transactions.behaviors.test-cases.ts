import {
  Resource,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
} from '@attraccess/database-entities';
import { registerEvaluateallScopeFixture } from './maintenance-schedule-evaluator.service.evaluateall-a68b2d.test-fixture';
import { registerRechecksADurationCycleCompletedBetweenTheBulkReadAndMaiPart8Cases } from './maintenance-schedule-evaluator.service.evaluateall.rechecks-a-duration-cycle-completed-between-the-bulk-read-and-mai.behaviors.test-cases';
import { registerShouldChunkUsageEvaluationQueriesBelowSqliteBindLimitsPart5Cases } from './maintenance-schedule-evaluator.service.evaluateall.rechecks-a-duration-cycle-completed-between-the-bulk-read-and-mai.behaviors.test-cases';
import { registerShouldContinueCreatingOtherDueMaintenancesWhenAStaleActiPart2Cases } from './maintenance-schedule-evaluator.service.evaluateall.rechecks-a-duration-cycle-completed-between-the-bulk-read-and-mai.behaviors.test-cases';
import { registerShouldContinueCreatingScheduledMaintenancesWhenOneCreationPart13Cases } from './maintenance-schedule-evaluator.service.evaluateall.rechecks-a-duration-cycle-completed-between-the-bulk-read-and-mai.behaviors.test-cases';
import { registerShouldCreateMaintenancesForResourcesWhoseTimeIntervalScheCases } from './maintenance-schedule-evaluator.service.evaluateall.rechecks-a-duration-cycle-completed-between-the-bulk-read-and-mai.behaviors.test-cases';
import { registerShouldDoNothingWhenNoEnabledSchedulesExistPart15Cases } from './maintenance-schedule-evaluator.service.evaluateall.should-do-nothing-when-no-enabled-schedules-exist.behaviors.test-cases';
import { registerShouldEvaluateEachUsageBasedScheduleAgainstItsOwnBaselinPart12Cases } from './maintenance-schedule-evaluator.service.evaluateall.should-evaluate-each-usage-based-schedule-against-its-own-baselin.test-cases';
import { registerShouldEvaluateUsageCountUsingBulkFetchedUsageDataPart10Cases } from './maintenance-schedule-evaluator.service.evaluateall.should-do-nothing-when-no-enabled-schedules-exist.behaviors.test-cases';
import { registerShouldEvaluateUsageHoursUsingBulkFetchedUsageDataPart7Cases } from './maintenance-schedule-evaluator.service.evaluateall.should-do-nothing-when-no-enabled-schedules-exist.behaviors.test-cases';
import { registerShouldNotCreateMaintenanceWhenTimeIntervalNotYetDuePart3Cases } from './maintenance-schedule-evaluator.service.evaluateall.should-do-nothing-when-no-enabled-schedules-exist.behaviors.test-cases';
import { registerShouldNotCreateMaintenanceWhenUsageCountThresholdNotMetPart11Cases } from './maintenance-schedule-evaluator.service.evaluateall.should-do-nothing-when-no-enabled-schedules-exist.behaviors.test-cases';
import { registerShouldNotCreateMaintenanceWhenUsageHoursThresholdNotMetPart9Cases } from './maintenance-schedule-evaluator.service.evaluateall.should-not-create-maintenance-when-usage-hours-threshold-not-met.behaviors.test-cases';
import { registerShouldNotEmitSideEffectsWhenTheWriteTransactionFailsToPart14Cases } from './maintenance-schedule-evaluator.service.evaluateall.should-not-create-maintenance-when-usage-hours-threshold-not-met.behaviors.test-cases';
import { registerShouldNotRunConcurrentEvaluationsWhenLockIsHeldPart17Cases } from './maintenance-schedule-evaluator.service.evaluateall.should-not-create-maintenance-when-usage-hours-threshold-not-met.behaviors.test-cases';
import { registerShouldSkipOrphanedSchedulesWithoutIssuingAnInvalidEmptyPPart4Cases } from './maintenance-schedule-evaluator.service.evaluateall.should-not-create-maintenance-when-usage-hours-threshold-not-met.behaviors.test-cases';
import { registerShouldSkipResourcesThatAlreadyHaveActiveMaintenancePart6Cases } from './maintenance-schedule-evaluator.service.evaluateall.should-not-create-maintenance-when-usage-hours-threshold-not-met.behaviors.test-cases';
import { registerShouldUseLastDoneMaintenanceEndtimeAsBaselineNotResourcePart16Cases } from './maintenance-schedule-evaluator.service.evaluateall.should-not-create-maintenance-when-usage-hours-threshold-not-met.behaviors.test-cases';
import { registerShouldWriteDueSchedulesInBoundedTransactionsPart1Cases } from './maintenance-schedule-evaluator.service.evaluateall.should-write-due-schedules-in-bounded-transactions.behaviors.test-cases';
import { registerMaintenanceScheduleEvaluatorServiceFixture } from './maintenance-schedule-evaluator.service.maintenance-schedule-evaluator-service.test-fixture';

export function registerShouldWriteDueSchedulesInBoundedTransactionsPart1Cases(
  fixture: ReturnType<typeof registerEvaluateallScopeFixture>,
) {
  it('should write due schedules in bounded transactions', async () => {
    const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');
    const dueSchedules = Array.from(
      { length: 101 },
      (_, index) =>
        ({
          id: fixture.fixture.scheduleId + index,
          resourceId: index + 1,
          enabled: true,
          triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
          timeIntervalConfig: { duration: 30, unit: 'DAYS' },
        }) as ResourceMaintenanceSchedule,
    );

    jest.spyOn(fixture.fixture.scheduleRepository, 'find').mockResolvedValue(dueSchedules);
    const maintenanceQb = fixture.fixture.createQueryBuilderMock();
    maintenanceQb.getRawMany.mockResolvedValue([]);
    jest.spyOn(fixture.fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(maintenanceQb as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    jest
      .spyOn(fixture.fixture.resourceRepository, 'find')
      .mockResolvedValue(dueSchedules.map(({ resourceId: id }) => ({ id, createdAt: oldCreatedAt }) as Resource));
    (fixture.fixture.maintenanceService.hasActiveMaintenance as jest.Mock).mockImplementation((id: number) =>
      Promise.resolve(id === 101),
    );

    await fixture.fixture.service.evaluateAll();

    expect(fixture.fixture.scheduleRepository.manager.transaction).toHaveBeenCalledTimes(2);
    expect(fixture.fixture.maintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(101, expect.anything());
    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).toHaveBeenCalledTimes(100);
    expect(fixture.fixture.maintenanceService.createMaintenanceFromSchedule).not.toHaveBeenCalledWith(
      101,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      false,
    );
  });
}

export function registerEvaluateAllCases(
  fixture: ReturnType<typeof registerMaintenanceScheduleEvaluatorServiceFixture>,
) {
  describe('evaluateAll', () => {
    const scope = registerEvaluateallScopeFixture(fixture);
    registerShouldCreateMaintenancesForResourcesWhoseTimeIntervalScheCases(scope);
    registerShouldWriteDueSchedulesInBoundedTransactionsPart1Cases(scope);
    registerShouldContinueCreatingOtherDueMaintenancesWhenAStaleActiPart2Cases(scope);
    registerShouldNotCreateMaintenanceWhenTimeIntervalNotYetDuePart3Cases(scope);
    registerShouldSkipOrphanedSchedulesWithoutIssuingAnInvalidEmptyPPart4Cases(scope);
    registerShouldChunkUsageEvaluationQueriesBelowSqliteBindLimitsPart5Cases(scope);
    registerShouldSkipResourcesThatAlreadyHaveActiveMaintenancePart6Cases(scope);
    registerShouldEvaluateUsageHoursUsingBulkFetchedUsageDataPart7Cases(scope);
    registerRechecksADurationCycleCompletedBetweenTheBulkReadAndMaiPart8Cases(scope);
    registerShouldNotCreateMaintenanceWhenUsageHoursThresholdNotMetPart9Cases(scope);
    registerShouldEvaluateUsageCountUsingBulkFetchedUsageDataPart10Cases(scope);
    registerShouldNotCreateMaintenanceWhenUsageCountThresholdNotMetPart11Cases(scope);
    registerShouldEvaluateEachUsageBasedScheduleAgainstItsOwnBaselinPart12Cases(scope);
    registerShouldContinueCreatingScheduledMaintenancesWhenOneCreationPart13Cases(scope);
    registerShouldNotEmitSideEffectsWhenTheWriteTransactionFailsToPart14Cases(scope);
    registerShouldDoNothingWhenNoEnabledSchedulesExistPart15Cases(scope);
    registerShouldUseLastDoneMaintenanceEndtimeAsBaselineNotResourcePart16Cases(scope);
    registerShouldNotRunConcurrentEvaluationsWhenLockIsHeldPart17Cases(scope);
  });
}
