import { registerResourceHealthServiceFixture } from './resource-health.service.resource-health-service.test-fixture';
import { registerReportHealthCases } from './resource-health.service.resource-health-service.report-health.test-cases';
import { registerIsResourceUnhealthyCases } from './resource-health.service.resource-health-service.clear-entry.behaviors.test-cases';
import { registerClearEntryCases } from './resource-health.service.resource-health-service.clear-entry.behaviors.test-cases';
import { registerGetSummaryCases } from './resource-health.service.resource-health-service.clear-entry.behaviors.test-cases';
describe('ResourceHealthService', () => {
  const fixture = registerResourceHealthServiceFixture();
  registerReportHealthCases(fixture);
  registerIsResourceUnhealthyCases(fixture);
  registerClearEntryCases(fixture);
  registerGetSummaryCases(fixture);
});
