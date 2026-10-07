import { ResourceMeteringSession } from '@attraccess/database-entities';
import { registerOperationsRejectsAReplyThatArrivesAfterTheOperationTimedOut } from './resource-metering.persistence.operations-rejects-a-reply-that-arrives-after-the-operation-timed-out.test-cases';
import { registerOperationsAcceptsAnIdenticalDuplicateReplyAndRejectsAConflictingOne } from './resource-metering.persistence.operations-accepts-an-identical-duplicate-reply-and-rejects-a-conflicting-one.test-cases';
import { registerOperationsRejectsAReplyOfTheWrongKindAndAReportForAnUnknownResource } from './resource-metering.persistence.operations-rejects-a-reply-of-the-wrong-kind-and-a-report-for-an-unknown-resource.test-cases';
import { registerOperationsFailsAnOperationWhoseBranchEndsWithoutReporting } from './resource-metering.persistence.operations-fails-an-operation-whose-branch-ends-without-reporting.test-cases';
import { registerOperationsSerializesConcurrentRequestsForOneResourceSoRepliesCannotCross } from './resource-metering.persistence.operations-serializes-concurrent-requests-for-one-resource-so-replies-cannot-cross.test-cases';
import { registerOperationsMarksOperationsInterruptedByARestartAsExpired } from './resource-metering.persistence.operations-marks-operations-interrupted-by-a-restart-as-expired.test-cases';
import { registerOperationsExposesTheRunningSessionSLiveTotalAndItsExactlyRoundedEnergyCost } from './resource-metering.persistence.operations-exposes-the-running-session-s-live-total-and-its-exactly-rounded-energy-cost.test-cases';
import { registerOperationsRecordsInterimReadingsForDisplayOnlyAndSkipsBusyOrDisabledMeters } from './resource-metering.persistence.operations-records-interim-readings-for-display-only-and-skips-busy-or-disabled-meters.test-cases';
import { registerOperationsDoesNotPollAMeterThatKeepsFailingMoreOftenThanItsInterval } from './resource-metering.persistence.operations-does-not-poll-a-meter-that-keeps-failing-more-often-than-its-interval.test-cases';
import { inheritTestScope } from '../../test-utils/inherit-test-scope';
import { FlowDefinedMeteringTestScope } from './resource-metering.persistence.spec';

export function defineOperationsTests(parentScope: FlowDefinedMeteringTestScope) {
  async function activeSession() {
    await parentScope.seedMeter();
    const started = await parentScope.usage.startSession(1, parentScope.users[0], {} as never);
    return parentScope.source.getRepository(ResourceMeteringSession).findOneByOrFail({ usageId: started.id });
  }
  const run = (session: ResourceMeteringSession, kind: 'interim' | 'final' = 'interim', timeoutSeconds = 5) =>
    parentScope.metering['runOperation'](session, kind, {
      trigger: parentScope.T.INPUT_METERING_COLLECT,
      timeoutSeconds,
      ...(kind === 'final' ? { freshAfter: new Date(Date.now() - 1000) } : {}),
    });
  const scope = inheritTestScope(
    {
      get activeSession() {
        return activeSession;
      },
      get onCollect() {
        return parentScope.onCollect;
      },
      set onCollect(value: typeof parentScope.onCollect) {
        parentScope.onCollect = value;
      },
      get run() {
        return run;
      },
      get source() {
        return parentScope.source;
      },
      set source(value: typeof parentScope.source) {
        parentScope.source = value;
      },
      get metering() {
        return parentScope.metering;
      },
      set metering(value: typeof parentScope.metering) {
        parentScope.metering = value;
      },
      get reading() {
        return parentScope.reading;
      },
      get usage() {
        return parentScope.usage;
      },
      set usage(value: typeof parentScope.usage) {
        parentScope.usage = value;
      },
      get users() {
        return parentScope.users;
      },
      set users(value: typeof parentScope.users) {
        parentScope.users = value;
      },
    },
    parentScope,
  );

  registerOperationsRejectsAReplyThatArrivesAfterTheOperationTimedOut(scope);

  registerOperationsAcceptsAnIdenticalDuplicateReplyAndRejectsAConflictingOne(scope);

  registerOperationsRejectsAReplyOfTheWrongKindAndAReportForAnUnknownResource(scope);

  registerOperationsFailsAnOperationWhoseBranchEndsWithoutReporting(scope);

  registerOperationsSerializesConcurrentRequestsForOneResourceSoRepliesCannotCross(scope);

  registerOperationsMarksOperationsInterruptedByARestartAsExpired(scope);

  registerOperationsExposesTheRunningSessionSLiveTotalAndItsExactlyRoundedEnergyCost(scope);

  registerOperationsRecordsInterimReadingsForDisplayOnlyAndSkipsBusyOrDisabledMeters(scope);

  registerOperationsDoesNotPollAMeterThatKeepsFailingMoreOftenThanItsInterval(scope);

  return scope;
}
