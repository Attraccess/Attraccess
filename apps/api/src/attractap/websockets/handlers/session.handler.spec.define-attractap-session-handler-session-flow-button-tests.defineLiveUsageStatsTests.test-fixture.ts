import { registerLiveUsageStatsReturnsCapturedMeterNamesAndRatesAfterEditsWithOperatingTimeAttributedToTheCurrentUsa } from './session.handler.live-usage-stats-returns-captured-meter-names-and-rates-after-edits-with-operating-time-attributed-to-the-current-usa.test-cases';
import { registerLiveUsageStatsFormatsTheCapturedRateUsingTheConfiguredCurrencyPrecision } from './session.handler.live-usage-stats-formats-the-captured-rate-using-the-configured-currency-precision.test-cases';
import { registerLiveUsageStatsKeepsASkippedFreeMeterUnavailableWithItsCapturedNameAndZeroRateAfterEdits } from './session.handler.live-usage-stats-keeps-a-skipped-free-meter-unavailable-with-its-captured-name-and-zero-rate-after-edits.test-cases';
import { registerLiveUsageStatsKeepsUnavailableReadingsDistinctFromZeroAndDiscardsADifferentMeterSession } from './session.handler.live-usage-stats-keeps-unavailable-readings-distinct-from-zero-and-discards-a-different-meter-session.test-cases';
import { registerLiveUsageStatsReturnsMultipleNamedMetersPreservingZeroAndUnavailableValues } from './session.handler.live-usage-stats-returns-multiple-named-meters-preserving-zero-and-unavailable-values.test-cases';
import { registerLiveUsageStatsDoesNotExposeReadingsWithoutAnOwnedSessionP } from './session.handler.live-usage-stats-does-not-expose-readings-without-an-owned-session-p.test-cases';
import { registerLiveUsageStatsDoesNotQueryWhenTheReaderCardGuardRejectsTheRequest } from './session.handler.live-usage-stats-does-not-query-when-the-reader-card-guard-rejects-the-request.test-cases';
import { registerLiveUsageStatsDiscardsResultsWhenTheCardChangesDuringTheLookup } from './session.handler.live-usage-stats-discards-results-when-the-card-changes-during-the-lookup.test-cases';
import { registerLiveUsageStatsClearsReadingsWhenTheDataServiceFailsWithoutFailingTheReaderSession } from './session.handler.live-usage-stats-clears-readings-when-the-data-service-fails-without-failing-the-reader-session.test-cases';
import { createLiveUsageStatsFixture } from './session.handler.spec.createLiveUsageStatsFixture.test-fixture';
import { AttractapSessionHandlerSessionFlowButtonTestScope } from './session.handler.spec.define-attractap-session-handler-session-flow-button-tests';
import { defineReaderAccessWithTheActualResourceGuardTests } from './session.handler.spec.define-attractap-session-handler-session-flow-button-tests.defineReaderAccessWithTheActualResourceGuardTests.test-fixture';

export function defineLiveUsageStatsTests(parentScope: AttractapSessionHandlerSessionFlowButtonTestScope) {
  const scope = createLiveUsageStatsFixture(parentScope);
  beforeEach(() => {
    parentScope.mockResourceUsageService.getActiveSession.mockResolvedValue({
      id: 99,
      userId: 1,
      startTime: scope.startTime,
    });
    parentScope.metering.getLive.mockResolvedValue({
      meters: [
        {
          id: 1,
          name: 'Renamed Heartbeats',
          creditsPerUnit: 100,
          session: { usageId: 99, meterName: 'Heartbeats', creditsPerUnit: 2, latestValue: '0.125' },
        },
      ],
    });
    parentScope.operating.getForResource.mockResolvedValue({
      operatingDataAvailable: true,
      isOperating: true,
      attributions: [
        { usageId: 99, durationMs: 120000 },
        { usageId: 98, durationMs: 80000 },
      ],
    });
  });
  registerLiveUsageStatsReturnsCapturedMeterNamesAndRatesAfterEditsWithOperatingTimeAttributedToTheCurrentUsa(scope);
  registerLiveUsageStatsFormatsTheCapturedRateUsingTheConfiguredCurrencyPrecision(scope);
  registerLiveUsageStatsKeepsASkippedFreeMeterUnavailableWithItsCapturedNameAndZeroRateAfterEdits(scope);
  registerLiveUsageStatsKeepsUnavailableReadingsDistinctFromZeroAndDiscardsADifferentMeterSession(scope);
  registerLiveUsageStatsReturnsMultipleNamedMetersPreservingZeroAndUnavailableValues(scope);
  registerLiveUsageStatsDoesNotExposeReadingsWithoutAnOwnedSessionP(scope);
  registerLiveUsageStatsDoesNotQueryWhenTheReaderCardGuardRejectsTheRequest(scope);
  describe('reader access with the actual resource guard', () => {
    defineReaderAccessWithTheActualResourceGuardTests(scope);
  });
  registerLiveUsageStatsDiscardsResultsWhenTheCardChangesDuringTheLookup(scope);
  registerLiveUsageStatsClearsReadingsWhenTheDataServiceFailsWithoutFailingTheReaderSession(scope);

  return scope;
}
