import { ResourceMeteringSession, ResourceUsage } from '@attraccess/database-entities';
import { ReconciliationTestScope } from './resource-metering.persistence.spec';
export function registerReconciliationRoundsALargeLateCorrectionExactlyAtTheHalfCreditBoundary(
  scope: ReconciliationTestScope,
): void {
  it('rounds a large late correction exactly at the half-credit boundary', async () => {
    const ended = await scope.endWithMissingFinal();
    const session = await scope.parentScope.sessionOf(ended.id);
    await scope.parentScope.source.getRepository(ResourceUsage).update(ended.id, { billingFactor: 50 });
    await scope.parentScope.source.getRepository(ResourceMeteringSession).update(session.id, { creditsPerUnit: 1 });
    scope.parentScope.onCollect = ({ complete }) =>
      complete({
        kind: 'reading',
        value: '9007199254740991',
        observedAt: ended.endTime?.toISOString(),
      });
    await scope.parentScope.metering.retrySettlement(1, session.id, 1);
    const { corrections, items: rows } = await scope.parentScope.correctionsOf(ended.id);
    expect(corrections[0].amount).toBe(-4503599627370495);
    expect(rows.find((item) => item.name === 'BILLING_FACTOR')?.unitPrice).toBe(-4503599627370496);
  });
}
