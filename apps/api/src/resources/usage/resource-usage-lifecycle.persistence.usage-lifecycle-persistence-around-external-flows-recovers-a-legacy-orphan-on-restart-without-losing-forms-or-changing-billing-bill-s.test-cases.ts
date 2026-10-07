import {
  BillingTransaction,
  BillingTransactionStatus,
  FormSubmission,
  Resource,
  ResourceFormAction,
  ResourceUsage,
} from '@attraccess/database-entities';
import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsRecoversALegacyOrphanOnRestartWithoutLosingFormsOrChangingBillingBillS(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it.each([false, true])(
    'recovers a legacy orphan on restart without losing forms or changing billing (bill=%s)',
    async (hasBill) => {
      await scope.source.getRepository(Resource).update(1, { allowTakeOver: false });
      const orphan = await scope.source.getRepository(ResourceUsage).save({
        resourceId: 1,
        userId: 1,
        startTime: new Date('2026-09-23T14:00:40Z'),
        endTime: null,
        isFinalized: false,
        lifecyclePending: false,
        startNotes: 'DEMO: ongoing laboratory run',
        endNotes: 'Original note',
        attributedOperatingDurationInMinutes: 17,
      });
      await scope.source.getRepository(FormSubmission).save({
        formId: 11,
        resourceUsageId: orphan.id,
        userId: 1,
        action: ResourceFormAction.START,
        data: { answer: 'kept' },
      });
      if (hasBill)
        await scope.source.getRepository(BillingTransaction).save({
          resourceUsageId: orphan.id,
          userId: 1,
          amount: 7,
          status: BillingTransactionStatus.Completed,
        });
      const before = await scope.publishedState();
      const emitted = jest.spyOn(scope.events, 'emit');
      expect((await scope.usage.getResourceUsageHistory(1)).data.map((row) => row.id)).toEqual([orphan.id]);
      expect(await scope.usage.getActiveSession(1)).toBeNull();
      expect((await scope.usage.getActiveSessions([1])).get(1)).toBeNull();
      await expect(scope.usage.endSession(1, scope.users[0], {})).rejects.toThrow('No active session found');

      await scope.usage.onModuleInit();
      const after = await scope.publishedState();
      expect(after.sessions).toEqual([
        expect.objectContaining({
          id: orphan.id,
          startTime: orphan.startTime,
          endTime: orphan.startTime,
          startNotes: orphan.startNotes,
          isFinalized: false,
          lifecyclePending: false,
          usageInMinutes: 0,
          attributedOperatingDurationInMinutes: 0,
          endNotes: expect.stringContaining('Original note\n[Recovery: cancelled orphan'),
        }),
      ]);
      expect(after.submissions).toEqual(before.submissions);
      expect(after.transactions).toEqual(before.transactions);
      expect(after.users).toEqual(before.users);
      const journal = await scope.source.query('SELECT * FROM resource_usage_recovery');
      expect(journal).toEqual([
        expect.objectContaining({
          usageId: orphan.id,
          resourceId: 1,
          userId: 1,
          originalEndNotes: 'Original note',
          originalAttributedOperatingDurationInMinutes: 17,
          reason: 'cancelled_orphan_unfinalized_session',
        }),
      ]);
      await scope.usage.recoverInterruptedLifecycles();
      expect(await scope.publishedState()).toEqual(after);
      expect(await scope.source.query('SELECT * FROM resource_usage_recovery')).toEqual(journal);
      expect(emitted).not.toHaveBeenCalled();
      expect(scope.flow.runFlow).not.toHaveBeenCalled();
      expect(scope.billing.chargeForResourceUsage).not.toHaveBeenCalled();
      expect(scope.billing.handleResourceUsageStart).not.toHaveBeenCalled();
      expect(scope.billing.notifyResourceUsageCharge).not.toHaveBeenCalled();
      expect((await scope.usage.getResourceUsageHistory(1)).data[0].formSubmissions).toHaveLength(1);
      const started = await scope.usage.startSession(1, scope.users[1], {});
      expect((await scope.usage.getActiveSession(1))?.id).toBe(started.id);
      expect((await scope.usage.getActiveSessions([1])).get(1)?.id).toBe(started.id);
    },
  );
}
