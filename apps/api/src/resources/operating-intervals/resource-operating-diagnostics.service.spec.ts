import { registerResourceOperatingDiagnosticsServiceFixture } from './resource-operating-diagnostics.service.resource-operating-diagnostics-service.test-fixture';
import { registerGetCurrentStateCases } from './resource-operating-diagnostics.service.resource-operating-diagnostics-service.get-current-state.behaviors.test-cases';
import { registerGetTransitionHistoryCases } from './resource-operating-diagnostics.service.resource-operating-diagnostics-service.get-current-state.behaviors.test-cases';
import { registerGetDataQualityReportCases } from './resource-operating-diagnostics.service.resource-operating-diagnostics-service.get-current-state.behaviors.test-cases';
import { registerVerifyTimelineCases } from './resource-operating-diagnostics.service.resource-operating-diagnostics-service.verify-timeline.test-cases';
import { registerUnionDurationMsCases } from './resource-operating-diagnostics.service.resource-operating-diagnostics-service.get-current-state.behaviors.test-cases';
describe('ResourceOperatingDiagnosticsService', () => {
  const fixture = registerResourceOperatingDiagnosticsServiceFixture();
  registerGetCurrentStateCases(fixture);
  registerGetTransitionHistoryCases(fixture);
  registerGetDataQualityReportCases(fixture);
  registerVerifyTimelineCases(fixture);
  registerUnionDurationMsCases(fixture);
});
