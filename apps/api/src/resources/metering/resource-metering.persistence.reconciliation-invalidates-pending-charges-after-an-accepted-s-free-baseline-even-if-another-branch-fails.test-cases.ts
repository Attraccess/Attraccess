import { ResourceMeter, ResourceMeteringSession, ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { ReconciliationTestScope } from './resource-metering.persistence.spec';
export function registerReconciliationInvalidatesPendingChargesAfterAnAcceptedSFreeBaselineEvenIfAnotherBranchFails(
  scope: ReconciliationTestScope,
): void {
  it.each([
    ['advancing', '105', '12000000000'],
    ['reset', '4', '7000000000'],
  ])(
    'invalidates pending charges after an accepted %s free baseline even if another branch fails',
    async (_kind, baseline, lifetimeValue) => {
      await scope.parentScope.source.getRepository(ResourceMeter).update(1, {
        counterValue: '100000000000',
        lifetimeValue: '7000000000',
      });
      scope.parentScope.onStart = ({ complete }) => complete({ kind: 'ready', baseline: { value: '100' } });
      const ended = await scope.endWithMissingFinal();
      const session = await scope.parentScope.sessionOf(ended.id);
      const before = await scope.parentScope.items(ended.id);
      const priorMeter = await scope.parentScope.source.getRepository(ResourceMeter).findOneByOrFail({ id: 1 });
      const unrelatedMeter = await scope.parentScope.source.getRepository(ResourceMeter).save({
        resourceId: 1,
        name: 'Water',
        creditsPerUnit: 0,
      });
      const unrelatedSession = await scope.parentScope.source.getRepository(ResourceMeteringSession).save({
        ...session,
        id: 'unrelated-pending',
        meterId: unrelatedMeter.id,
        meterName: unrelatedMeter.name,
      });
      await scope.parentScope.metering.setRate(1, 1, 0);
      scope.parentScope.onStart = async ({ complete }) => {
        await complete({ kind: 'ready', baseline: { value: baseline }, source: 'reinitialized-meter' });
        throw new Error('another start branch failed');
      };

      const started = await scope.start(scope.parentScope.users[1]);
      expect((await scope.parentScope.usage.getActiveSession(1))?.id).toBe(started.id);
      expect(
        await scope.parentScope.source.getRepository(ResourceMeteringSession).countBy({ usageId: started.id }),
      ).toBe(0);
      const acceptedMeter = await scope.parentScope.source.getRepository(ResourceMeter).findOneByOrFail({ id: 1 });
      expect(acceptedMeter).toEqual(
        expect.objectContaining({
          counterValue: `${baseline}000000000`,
          lifetimeValue,
          latestObservedAt: expect.any(Date),
        }),
      );
      expect(acceptedMeter.latestObservedAt?.getTime()).toBeGreaterThanOrEqual(
        priorMeter.latestObservedAt?.getTime() ?? 0,
      );
      expect(await scope.parentScope.sessionOf(ended.id)).toEqual(
        expect.objectContaining({
          status: ResourceMeteringSessionStatus.Failed,
          failureReason: 'The meter was re-initialized for a later session',
        }),
      );
      expect((await scope.parentScope.metering.getStatus(1)).unsettled).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sessionId: session.id, retryable: false, status: 'failed' }),
          expect.objectContaining({ sessionId: unrelatedSession.id, retryable: true, status: 'pending' }),
        ]),
      );
      expect(
        await scope.parentScope.source
          .getRepository(ResourceMeteringSession)
          .findOneByOrFail({ id: unrelatedSession.id }),
      ).toEqual(unrelatedSession);

      // Even valid historical end-boundary evidence cannot charge an invalidated session.
      scope.parentScope.onCollect = jest.fn(
        scope.parentScope.reading('101.5', { observedAt: ended.endTime?.toISOString() }),
      );
      await expect(scope.parentScope.metering.retrySettlement(1, session.id, 1)).rejects.toThrow(
        'METER_SESSION_NOT_PENDING',
      );
      expect(scope.parentScope.onCollect).not.toHaveBeenCalled();
      expect((await scope.parentScope.correctionsOf(ended.id)).corrections).toEqual([]);
      expect(await scope.parentScope.items(ended.id)).toEqual(before);
      expect(scope.parentScope.audit.recordBillingTransactionAfterCommit).not.toHaveBeenCalled();
      expect(scope.parentScope.liveNotifications.notifyTransactionUpdate).not.toHaveBeenCalled();
    },
  );
}
