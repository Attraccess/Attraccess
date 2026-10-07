import {
  BillingTransaction,
  BillingTransactionStatus,
  ResourceUsageLifecycleAttempt,
  User,
} from '@attraccess/database-entities';
import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsPreservesTheCompletePriceContractThroughAStartFlowTakeoverS(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it.each([false, true])(
    'preserves the complete price contract through a start flow (takeover=%s)',
    async (takeover) => {
      await scope.migrateIntegrity();
      if (takeover) await scope.seedActiveSession();
      const starter = scope.users[1];
      await scope.source.getRepository(User).update(starter.id, { billingFactor: 50 });
      starter.billingFactor = 75; // Request authentication may predate a billing-factor edit.
      scope.flow.runFlow.mockImplementation(async () => {
        await scope.source.getRepository(User).update(starter.id, { billingFactor: 150 });
        scope.billing.getResourceBillingConfiguration.mockResolvedValue({
          creditsPerUsage: 99,
          creditsPerMinute: 99,
          creditsPerOperatingMinute: 99,
        });
      });

      const session = await scope.usage.startSession(1, starter, { forceTakeOver: takeover });

      expect(session).toMatchObject({
        lifecyclePending: false,
        creditsPerUsage: 5,
        billingFactor: 50,
        sessionDurationCreditsPerMinute: 2,
        operatingDurationCreditsPerMinute: 3,
      });
      expect(
        await scope.source.getRepository(BillingTransaction).findOneBy({ resourceUsageId: session.id }),
      ).toMatchObject({
        status: BillingTransactionStatus.Pending,
        amount: 0,
      });
      expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    },
  );
}
