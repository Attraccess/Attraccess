import { registerMaintenanceScheduleEvaluatorServiceFixture } from './maintenance-schedule-evaluator.service.maintenance-schedule-evaluator-service.test-fixture';
import { registerShouldBeDefinedCases } from './maintenance-schedule-evaluator.service.maintenance-schedule-evaluator-service.get-baseline-date.behaviors.test-cases';
import { registerGetBaselineDateCases } from './maintenance-schedule-evaluator.service.maintenance-schedule-evaluator-service.get-baseline-date.behaviors.test-cases';
import { registerSelectsTotalOperatingDurationIndependentlyOfSessionDurationCases } from './maintenance-schedule-evaluator.service.maintenance-schedule-evaluator-service.get-baseline-date.behaviors.test-cases';
import { registerEvaluateResourceCases } from './maintenance-schedule-evaluator.service.maintenance-schedule-evaluator-service.evaluate-resource.test-cases';
import { registerEvaluateAllCases } from './maintenance-schedule-evaluator.service.evaluateall.should-write-due-schedules-in-bounded-transactions.behaviors.test-cases';
import { registerOnResourceUsageCases } from './maintenance-schedule-evaluator.service.maintenance-schedule-evaluator-service.on-resource-usage.test-cases';
import { registerOnMaintenanceChangedCases } from './maintenance-schedule-evaluator.service.maintenance-schedule-evaluator-service.get-baseline-date.behaviors.test-cases';
describe('MaintenanceScheduleEvaluatorService', () => {
  const fixture = registerMaintenanceScheduleEvaluatorServiceFixture();
  registerShouldBeDefinedCases(fixture);
  registerGetBaselineDateCases(fixture);
  registerSelectsTotalOperatingDurationIndependentlyOfSessionDurationCases(fixture);
  registerEvaluateResourceCases(fixture);
  registerEvaluateAllCases(fixture);
  registerOnResourceUsageCases(fixture);
  registerOnMaintenanceChangedCases(fixture);
});
