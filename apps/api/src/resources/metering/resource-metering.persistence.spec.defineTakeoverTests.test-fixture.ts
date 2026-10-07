import { registerTakeoverPreservesIncrementOnlyChargesWhenALaterMeterFailsTakeoverInitialization } from './resource-metering.persistence.takeover-preserves-increment-only-charges-when-a-later-meter-fails-takeover-initialization.test-cases';
import { registerTakeoverPreservesRecoveryForAnUntouchedMeterWhenAnotherTakeoverStartFails } from './resource-metering.persistence.takeover-preserves-recovery-for-an-untouched-meter-when-another-takeover-start-fails.test-cases';
import { registerTakeoverReadsTheOutgoingTotalBeforeReInitializingTheMeterForTheNextSessionAndBillsBoth } from './resource-metering.persistence.takeover-reads-the-outgoing-total-before-re-initializing-the-meter-for-the-next-session-and-bills-both.test-cases';
import { registerTakeoverKeepsTheOutgoingSessionButRefusesToBillItsUnreliableTotalWhenTheNewMeterStartFails } from './resource-metering.persistence.takeover-keeps-the-outgoing-session-but-refuses-to-bill-its-unreliable-total-when-the-new-meter-start-fails.test-cases';
import { registerTakeoverMarksTheOutgoingEnergyFailedNotRetryableWhenItsFinalReadingIsMissingAndTheNextSessio } from './resource-metering.persistence.takeover-marks-the-outgoing-energy-failed-not-retryable-when-its-final-reading-is-missing-and-the-next-sessio.test-cases';
import { inheritTestScope } from '../../test-utils/inherit-test-scope';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';

export function defineTakeoverTests(parentScope: UsageLifecycleTestScope) {
  const scope = inheritTestScope(
    {
      get parentScope() {
        return parentScope;
      },
      get start() {
        return parentScope.start;
      },
      get end() {
        return parentScope.end;
      },
    },
    parentScope,
  );
  registerTakeoverPreservesIncrementOnlyChargesWhenALaterMeterFailsTakeoverInitialization(scope);

  registerTakeoverPreservesRecoveryForAnUntouchedMeterWhenAnotherTakeoverStartFails(scope);

  registerTakeoverReadsTheOutgoingTotalBeforeReInitializingTheMeterForTheNextSessionAndBillsBoth(scope);

  registerTakeoverKeepsTheOutgoingSessionButRefusesToBillItsUnreliableTotalWhenTheNewMeterStartFails(scope);

  registerTakeoverMarksTheOutgoingEnergyFailedNotRetryableWhenItsFinalReadingIsMissingAndTheNextSessio(scope);

  return scope;
}
