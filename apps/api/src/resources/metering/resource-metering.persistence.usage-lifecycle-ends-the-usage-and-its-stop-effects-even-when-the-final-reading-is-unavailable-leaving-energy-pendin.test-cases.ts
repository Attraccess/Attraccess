import { BillingTransactionStatus, ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';
export function registerUsageLifecycleEndsTheUsageAndItsStopEffectsEvenWhenTheFinalReadingIsUnavailableLeavingEnergyPendin(
  scope: UsageLifecycleTestScope,
): void {
  it('ends the usage and its stop effects even when the final reading is unavailable, leaving energy pending', async () => {
    await scope.seedMeter({}, { finalAttempts: 2, finalRetryDelaySeconds: 0 });
    await scope.start();
    scope.onCollect = async () => {
      throw new Error('meter unreachable');
    };
    const ended = await scope.end();

    expect(ended.endTime).not.toBeNull();
    expect(scope.log.filter((entry) => entry === 'meter:final')).toHaveLength(2);
    const { transaction, items: rows } = await scope.items(ended.id);
    expect(transaction.status).toBe(BillingTransactionStatus.Completed);
    expect(rows.filter((item) => item.name === 'Energy (kWh)')).toEqual([
      expect.objectContaining({ meterQuantity: null, meterCreditsPerUnit: 30, unitPrice: 0 }),
    ]);
    expect(await scope.sessionOf(ended.id)).toEqual(
      expect.objectContaining({ status: ResourceMeteringSessionStatus.Pending, failureReason: 'meter unreachable' }),
    );
    expect((await scope.metering.getStatus(1)).unsettled).toEqual([
      expect.objectContaining({ status: 'pending', retryable: true, reason: 'meter unreachable' }),
    ]);
  });
}
