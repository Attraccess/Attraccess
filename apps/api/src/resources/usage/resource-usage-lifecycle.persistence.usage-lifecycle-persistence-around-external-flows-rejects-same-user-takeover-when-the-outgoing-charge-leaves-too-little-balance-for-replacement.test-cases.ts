import {
  BillingTransaction,
  BillingTransactionStatus,
  ResourceOperatingInterval,
  ResourceUsageLifecycleAttempt,
  User,
} from '@attraccess/database-entities';
import { InsufficientBalanceError } from '../../billing/errors/insufficient-balance.error';
import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsRejectsSameUserTakeoverWhenTheOutgoingChargeLeavesTooLittleBalanceForReplacement(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it('rejects same-user takeover when the outgoing charge leaves too little balance for replacement', async () => {
    await scope.seedActiveSession();
    await scope.source.getRepository(User).update(scope.users[0].id, { creditBalance: 23 });
    const before = await scope.publishedState();
    const checkedBalances: number[] = [];
    scope.billing.validateResourceUsageStart.mockImplementation(async (_resourceId, session, user, manager) => {
      const storedUser = await manager.findOneByOrFail(User, { id: user.id });
      checkedBalances.push(storedUser.creditBalance);
      if (storedUser.creditBalance < session.sessionDurationCreditsPerMinute) throw new InsufficientBalanceError();
    });
    scope.billing.handleResourceUsageStart.mockImplementation(async (resourceId, session, user, manager) => {
      await scope.billing.validateResourceUsageStart(resourceId, session, user, manager);
      return manager.save(BillingTransaction, {
        resourceUsageId: session.id,
        userId: user.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      });
    });
    scope.flow.runFlow.mockImplementation(async (resourceId, _trigger, payload, _manager, { lifecycleAttemptId }) => {
      await scope.operating.transition(resourceId, 'operating', {
        flowNodeId: 'observed-operation',
        flowRunId: 'same-user-takeover',
      });
      await scope.usage.stageLifecycleBillingItem(lifecycleAttemptId, resourceId, payload.id, scope.draftItem);
    });

    await expect(scope.usage.startSession(1, scope.users[0], { forceTakeOver: true })).rejects.toBeInstanceOf(
      InsufficientBalanceError,
    );

    expect(checkedBalances).toEqual([23, 0]);
    expect(await scope.publishedState()).toEqual(before);
    expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(await scope.source.getRepository(ResourceOperatingInterval).count()).toBe(1);
    expect(scope.billing.notifyResourceUsageCharge).not.toHaveBeenCalled();
    expect(scope.flow.trackResourceActivity).not.toHaveBeenCalled();
  });
}
