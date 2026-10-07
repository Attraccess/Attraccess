import { registerReadOnlyInspectionReports2022VersusApplication2026WithoutMutationOrConsent } from './wago-commissioning-clock.read-only-inspection-reports-2022-versus-application-2026-without-mutation-or-consent.test-cases';
import { registerDoesNotChangeAnAlreadyAlignedClockIncludingWhenTheMutatorIsUnsupported } from './wago-commissioning-clock.does-not-change-an-already-aligned-clock-including-when-the-mutator-is-unsupported.test-cases';
import { registerRejectsUnsupportedToolBeforeMutation } from './wago-commissioning-clock.rejects-unsupported-tool-before-mutation.test-cases';
import { registerUsesTheExactSourcePinnedVendorUtcArgumentsAndVerifiesAFreshPostcondition } from './wago-commissioning-clock.uses-the-exact-source-pinned-vendor-utc-arguments-and-verifies-a-fresh-postcondition.test-cases';
import { registerRechecksApplicationClockContinuityImmediatelyBeforeEnrollmentIncludingAfterPersistence } from './wago-commissioning-clock.rechecks-application-clock-continuity-immediately-before-enrollment-including-after-persistence.test-cases';
import { registerBlocksSCorrectionPostcondition } from './wago-commissioning-clock.blocks-s-correction-postcondition.test-cases';
import { registerDoesNotAdmitAnAheadClockHiddenByResponseLatency } from './wago-commissioning-clock.does-not-admit-an-ahead-clock-hidden-by-response-latency.test-cases';
import { registerIncludesObservationUncertaintyRatherThanClaimingTheMidpointIsExact } from './wago-commissioning-clock.includes-observation-uncertainty-rather-than-claiming-the-midpoint-is-exact.test-cases';
import { registerAdvancesTheAllowlistedUtcDateAcrossMidnightWithoutAcceptingUnboundedElapsedTime } from './wago-commissioning-clock.advances-the-allowlisted-utc-date-across-midnight-without-accepting-unbounded-elapsed-time.test-cases';
import { registerRejectsMalformedObservationS } from './wago-commissioning-clock.rejects-malformed-observation-s.test-cases';
import { registerRejectsInvalidHostEpochS } from './wago-commissioning-clock.rejects-invalid-host-epoch-s.test-cases';
import { registerRejectsExcessiveSkew } from './wago-commissioning-clock.rejects-excessive-skew.test-cases';
import { registerRejectsSBeforeMutation } from './wago-commissioning-clock.rejects-s-before-mutation.test-cases';

const host = Date.parse('2026-09-06T18:00:00Z');
const epoch = host / 1000;
const oldEpoch = Date.parse('2022-06-05T13:44:02Z') / 1000;
const boot = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const output = (time = oldEpoch, tool = 'supported', uptime = '100.00', id = boot) =>
  `epoch=${time}\nuptime=${uptime}\nboot=${id}\ntool=${tool}\n`;

describe('source-backed commissioning clock gate (mocked transport only)', () => {
  defineSourceBackedCommissioningClockGateMockedTransportOnlyTests();
});

export function defineSourceBackedCommissioningClockGateMockedTransportOnlyTests() {
  const report = jest.fn().mockResolvedValue(undefined);
  beforeEach(() => report.mockClear());
  const scope = {
    get output() {
      return output;
    },
    get report() {
      return report;
    },
    get host() {
      return host;
    },
    get oldEpoch() {
      return oldEpoch;
    },
    get epoch() {
      return epoch;
    },
    get boot() {
      return boot;
    },
  };

  registerReadOnlyInspectionReports2022VersusApplication2026WithoutMutationOrConsent(scope);

  registerDoesNotChangeAnAlreadyAlignedClockIncludingWhenTheMutatorIsUnsupported(scope);

  registerRejectsUnsupportedToolBeforeMutation(scope);

  registerUsesTheExactSourcePinnedVendorUtcArgumentsAndVerifiesAFreshPostcondition(scope);

  registerRechecksApplicationClockContinuityImmediatelyBeforeEnrollmentIncludingAfterPersistence(scope);

  registerBlocksSCorrectionPostcondition(scope);

  registerDoesNotAdmitAnAheadClockHiddenByResponseLatency(scope);

  registerIncludesObservationUncertaintyRatherThanClaimingTheMidpointIsExact(scope);

  registerAdvancesTheAllowlistedUtcDateAcrossMidnightWithoutAcceptingUnboundedElapsedTime(scope);

  registerRejectsMalformedObservationS(scope);

  registerRejectsInvalidHostEpochS(scope);

  registerRejectsExcessiveSkew(scope);

  registerRejectsSBeforeMutation(scope);

  return scope;
}

export type SourceBackedCommissioningClockGateMockedTransportOnlyTestScope = ReturnType<
  typeof defineSourceBackedCommissioningClockGateMockedTransportOnlyTests
>;
