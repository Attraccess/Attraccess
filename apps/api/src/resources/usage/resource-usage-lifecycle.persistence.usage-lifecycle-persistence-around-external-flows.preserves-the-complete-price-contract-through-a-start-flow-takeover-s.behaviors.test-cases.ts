import {
  BillingTransaction,
  BillingTransactionStatus,
  ResourceUsageLifecycleAttempt,
  User,
  ResourceUsage,
  ResourceOperatingInterval,
} from '@attraccess/database-entities';
import { registerUsageLifecyclePersistenceAroundExternalFlowsFixture } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows.test-fixture';
import { InsufficientBalanceError } from '../../billing/errors/insufficient-balance.error';

export function registerPreservesTheCompletePriceContractThroughAStartFlowTakeoverSCases(
  fixture: ReturnType<typeof registerUsageLifecyclePersistenceAroundExternalFlowsFixture>,
) {
  it.each([false, true])(
    'preserves the complete price contract through a start flow (takeover=%s)',
    async (takeover) => {
      if (takeover) await fixture.seedActiveSession();
      const starter = fixture.users[1];
      await fixture.source.getRepository(User).update(starter.id, { billingFactor: 50 });
      starter.billingFactor = 75; // Request authentication may predate a billing-factor edit.
      fixture.flow.runFlow.mockImplementation(async () => {
        await fixture.source.getRepository(User).update(starter.id, { billingFactor: 150 });
        fixture.billing.getResourceBillingConfiguration.mockResolvedValue({
          creditsPerUsage: 99,
          creditsPerMinute: 99,
          creditsPerOperatingMinute: 99,
        });
      });

      const session = await fixture.usage.startSession(1, starter, { forceTakeOver: takeover });

      expect(session).toMatchObject({
        lifecyclePending: false,
        creditsPerUsage: 5,
        billingFactor: 50,
        sessionDurationCreditsPerMinute: 2,
        operatingDurationCreditsPerMinute: 3,
      });
      expect(
        await fixture.source.getRepository(BillingTransaction).findOneBy({ resourceUsageId: session.id }),
      ).toMatchObject({
        status: BillingTransactionStatus.Pending,
        amount: 0,
      });
      expect(await fixture.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    },
  );
}

export function registerPublishesNeitherTheSessionNorItsBillIfPendingTransactionCreationFailsCases(
  fixture: ReturnType<typeof registerUsageLifecyclePersistenceAroundExternalFlowsFixture>,
) {
  it('publishes neither the session nor its bill if pending transaction creation fails', async () => {
    fixture.billing.handleResourceUsageStart.mockImplementation(async (_resourceId, session, user, manager) => {
      await manager.save(BillingTransaction, {
        resourceUsageId: session.id,
        userId: user.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      });
      throw new Error('pending transaction unavailable');
    });

    await expect(fixture.usage.startSession(1, fixture.users[0], {})).rejects.toThrow(
      'pending transaction unavailable',
    );

    expect(await fixture.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await fixture.source.getRepository(BillingTransaction).count()).toBe(0);
    expect(await fixture.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(fixture.flow.trackResourceActivity).not.toHaveBeenCalled();
  });
}

export function registerRejectsSameUserTakeoverWhenTheOutgoingChargeLeavesTooLittleBalanceForRepCases(
  fixture: ReturnType<typeof registerUsageLifecyclePersistenceAroundExternalFlowsFixture>,
) {
  it('rejects same-user takeover when the outgoing charge leaves too little balance for replacement', async () => {
    await fixture.seedActiveSession();
    await fixture.source.getRepository(User).update(fixture.users[0].id, { creditBalance: 23 });
    const before = await fixture.publishedState();
    const checkedBalances: number[] = [];
    fixture.billing.validateResourceUsageStart.mockImplementation(async (_resourceId, session, user, manager) => {
      const storedUser = await manager.findOneByOrFail(User, { id: user.id });
      checkedBalances.push(storedUser.creditBalance);
      if (storedUser.creditBalance < session.sessionDurationCreditsPerMinute) throw new InsufficientBalanceError();
    });
    fixture.billing.handleResourceUsageStart.mockImplementation(async (resourceId, session, user, manager) => {
      await fixture.billing.validateResourceUsageStart(resourceId, session, user, manager);
      return manager.save(BillingTransaction, {
        resourceUsageId: session.id,
        userId: user.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      });
    });
    fixture.flow.runFlow.mockImplementation(async (resourceId, _trigger, payload, _manager, { lifecycleAttemptId }) => {
      await fixture.operating.transition(resourceId, 'operating', {
        flowNodeId: 'observed-operation',
        flowRunId: 'same-user-takeover',
      });
      await fixture.usage.stageLifecycleBillingItem(lifecycleAttemptId, resourceId, payload.id, fixture.draftItem);
    });

    await expect(fixture.usage.startSession(1, fixture.users[0], { forceTakeOver: true })).rejects.toBeInstanceOf(
      InsufficientBalanceError,
    );

    expect(checkedBalances).toEqual([23, 0]);
    expect(await fixture.publishedState()).toEqual(before);
    expect(await fixture.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(await fixture.source.getRepository(ResourceOperatingInterval).count()).toBe(1);
    expect(fixture.billing.notifyResourceUsageCharge).not.toHaveBeenCalled();
    expect(fixture.flow.trackResourceActivity).not.toHaveBeenCalled();
  });
}
