import type { UsageSessionWithParties, UsageSessionUser } from '@attraccess/application-models';
import type { BillingService } from '../../../billing/charges/billing.service';
import type { FinalCollection } from '../../metering/resource-metering.service';
import type { UsageLifecycle } from '../lifecycle/usage-lifecycle';

/** Ends the unit of work of the trial charge, so that none of it is kept. */
class TrialCharge extends Error {}

/** A switch whose continuation is billed as a new session, with what its commit is going to charge. */
export interface NewSessionSwitch {
  resourceId: number;
  previousUsageId: number;
  continuation: UsageSessionWithParties;
  switchTime: Date;
  final: FinalCollection;
  user: UsageSessionUser;
}

/**
 * The commit refuses a new session the balance cannot pay for after the old part's charge, but by then the switch
 * flows have told devices about the switch. So the same check runs before them, after a charge of the old part that
 * is rolled back. Billing items the flows add are only known at the commit: where one could lower the charge, a
 * refusal is not certain yet and is left to the commit.
 */
export async function assertNewSessionPayableAfterCharge(
  lifecycle: UsageLifecycle,
  billing: BillingService,
  { resourceId, previousUsageId, continuation, switchTime, final, user }: NewSessionSwitch,
): Promise<void> {
  try {
    await lifecycle.transaction(async (scope) => {
      if (await billing.flowsMayLowerCharge(resourceId, scope)) return;
      const { sessions } = lifecycle;
      // A session that changed meanwhile is the commit's to report.
      const end = { endTime: switchTime, endNotes: null };
      if (!(await sessions.endSessionIfOpen(previousUsageId, end, scope))) return;
      const ended = await sessions.findSessionWithRelations(previousUsageId, 'ended', scope);
      await lifecycle.settleEndedSession(scope, ended, final);
      await billing.validateResourceUsageStart(resourceId, continuation, user, scope);
      throw new TrialCharge();
    });
  } catch (error) {
    if (!(error instanceof TrialCharge)) throw error;
  }
}
