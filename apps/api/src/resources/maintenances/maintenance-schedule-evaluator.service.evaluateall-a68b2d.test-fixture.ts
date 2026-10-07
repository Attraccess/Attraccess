import { registerMaintenanceScheduleEvaluatorServiceFixture } from './maintenance-schedule-evaluator.service.maintenance-schedule-evaluator-service.test-fixture';

export function registerEvaluateallScopeFixture(
  fixture: ReturnType<typeof registerMaintenanceScheduleEvaluatorServiceFixture>,
) {
  return {
    get fixture() {
      return fixture;
    },
  };
}
