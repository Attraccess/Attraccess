import { ResourceUsage } from '@attraccess/database-entities';
import { ReconciliationTestScope } from './resource-metering.persistence.spec';
export function registerReconciliationAppliesTheUsageBillingFactorToALateEnergyChargeLikeEveryOtherItem(
  scope: ReconciliationTestScope,
): void {
  it('applies the usage billing factor to a late energy charge like every other item', async () => {
    const ended = await scope.endWithMissingFinal();
    await scope.parentScope.source.getRepository(ResourceUsage).update(ended.id, { billingFactor: 50 });
    await scope.parentScope.metering.retrySettlement(1, (await scope.parentScope.sessionOf(ended.id)).id, 1);
    const { corrections, items: rows } = await scope.parentScope.correctionsOf(ended.id);
    // 45 credits of energy, half price: round(45 - 22.5) = 23 discount, 22 charged.
    expect(corrections[0].amount).toBe(-22);
    expect(rows.find((item) => item.name === 'BILLING_FACTOR')?.unitPrice).toBe(-23);
  });
}
