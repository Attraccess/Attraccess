import { ResourceMeteringSession, ResourceMeteringSessionStatus, ResourceUsage } from '@attraccess/database-entities';
import { registerUsageLifecycleScopeFixture } from './resource-metering.persistence.usage-lifecycle-06b10e.test-fixture';
export function registerReconciliationPart17Cases(fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>) {
  describe('reconciliation', () => {
    async function endWithMissingFinal() {
      await fixture.fixture.seedMeter({}, { finalAttempts: 1 });
      await fixture.start();
      fixture.fixture.onCollect = async () => {
        throw new Error('meter unreachable');
      };
      const ended = await fixture.end();
      fixture.fixture.onCollect = fixture.fixture.reading('1.5');
      return ended;
    }

    it('retrying bills the pending energy as a separate correction exactly once and leaves the bill untouched', async () => {
      const ended = await endWithMissingFinal();
      const session = await fixture.fixture.sessionOf(ended.id);
      const before = await fixture.fixture.items(ended.id);

      await fixture.fixture.metering.retrySettlement(1, session.id, 1);
      expect(await fixture.fixture.items(ended.id)).toEqual(before);
      const { original, corrections, items: correctionItems } = await fixture.fixture.correctionsOf(ended.id);
      expect(corrections).toEqual([
        expect.objectContaining({ amount: -45, status: 'completed', initiatorId: 1, resourceUsageId: null }),
      ]);
      expect(corrections[0].userId).toBe(original.userId);
      expect(fixture.fixture.audit.recordBillingTransactionAfterCommit).toHaveBeenCalledTimes(1);
      expect(fixture.fixture.audit.recordBillingTransactionAfterCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: corrections[0].id,
          userId: original.userId,
          initiatorId: 1,
          amount: -45,
          source: 'energy-correction',
        }),
        expect.anything(),
      );
      expect(fixture.fixture.liveNotifications.notifyTransactionUpdate).toHaveBeenCalledWith(corrections[0].id);
      expect(correctionItems.filter((item) => item.name === 'ENERGY')).toHaveLength(1);
      expect(await fixture.fixture.sessionOf(ended.id)).toEqual(
        expect.objectContaining({ status: 'settled', chargeCredits: 45 }),
      );
      await expect(fixture.fixture.metering.retrySettlement(1, session.id, 1)).rejects.toThrow(
        expect.objectContaining({ message: 'METER_SESSION_NOT_PENDING' }),
      );
      expect((await fixture.fixture.correctionsOf(ended.id)).corrections).toHaveLength(1);
    });

    it('applies the usage billing factor to a late energy charge like every other item', async () => {
      const ended = await endWithMissingFinal();
      await fixture.fixture.source.getRepository(ResourceUsage).update(ended.id, { billingFactor: 50 });
      await fixture.fixture.metering.retrySettlement(1, (await fixture.fixture.sessionOf(ended.id)).id, 1);
      const { corrections, items: rows } = await fixture.fixture.correctionsOf(ended.id);
      // 45 credits of energy, half price: round(45 - 22.5) = 23 discount, 22 charged.
      expect(corrections[0].amount).toBe(-22);
      expect(rows.find((item) => item.name === 'BILLING_FACTOR')?.unitPrice).toBe(-23);
    });

    it('keeps the charge pending with the reason when the retry is stale or invalid', async () => {
      const ended = await endWithMissingFinal();
      fixture.fixture.onCollect = fixture.fixture.reading('1.5', 'kWh', { observedAt: '2020-01-01T00:00:00Z' });
      await expect(
        fixture.fixture.metering.retrySettlement(1, (await fixture.fixture.sessionOf(ended.id)).id, 1),
      ).rejects.toThrow(expect.objectContaining({ message: expect.stringMatching(/^METER_SETTLEMENT_FAILED/) }));
      expect(await fixture.fixture.sessionOf(ended.id)).toEqual(
        expect.objectContaining({ status: 'pending', failureReason: expect.stringMatching(/observed at/) }),
      );
      expect((await fixture.fixture.items(ended.id)).transaction.amount).toBe(0);
      expect((await fixture.fixture.correctionsOf(ended.id)).corrections).toEqual([]);
      expect(fixture.fixture.audit.recordBillingTransactionAfterCommit).not.toHaveBeenCalled();
      expect(fixture.fixture.liveNotifications.notifyTransactionUpdate).not.toHaveBeenCalled();
    });

    it('refuses to reconcile after a later session started on the meter, and can be waived', async () => {
      const ended = await endWithMissingFinal();
      await fixture.start(fixture.fixture.users[1]);
      const session = await fixture.fixture.sessionOf(ended.id);
      // Starting the next session already failed the older pending energy.
      expect(session.status).toBe(ResourceMeteringSessionStatus.Failed);
      await fixture.fixture.source
        .getRepository(ResourceMeteringSession)
        .update(session.id, { status: ResourceMeteringSessionStatus.Pending });
      await expect(fixture.fixture.metering.retrySettlement(1, session.id, 1)).rejects.toThrow(
        expect.objectContaining({ message: expect.stringMatching(/^METER_SETTLEMENT_FAILED/) }),
      );
      expect((await fixture.fixture.metering.waive(1, session.id, 7)).status).toBe(
        ResourceMeteringSessionStatus.Waived,
      );
      expect(fixture.fixture.audit.recordResource).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'energy_charge.waived', actorId: 7, subjectId: 1 }),
      );
      await expect(fixture.fixture.metering.waive(1, session.id, 7)).rejects.toThrow(
        expect.objectContaining({ message: 'METER_SESSION_NOT_PENDING' }),
      );
    });
  });
}
