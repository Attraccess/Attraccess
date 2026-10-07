import { ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';
export function registerUsageLifecycleNeverTurnsSIntoAZeroCharge(scope: UsageLifecycleTestScope): void {
  it.each([
    ['a non-numeric reading', scope.reading('n/a')],
    ['an empty reading', scope.reading('')],
    ['a negative reading', scope.reading('-1')],
    ['a stale sample from before the stop', scope.reading('1.5', { observedAt: '2020-01-01T00:00:00Z' })],
    ['a sample from the future', scope.reading('1.5', { observedAt: '2999-01-01T00:00:00Z' })],
  ])('never turns %s into a zero charge', async (_name, handler) => {
    await scope.seedMeter({}, { finalAttempts: 1 });
    await scope.start();
    scope.onCollect = handler;
    const ended = await scope.end();
    const { transaction, items: rows } = await scope.items(ended.id);
    expect(rows.filter((item) => item.name === 'Energy (kWh)')).toEqual([
      expect.objectContaining({ meterQuantity: null, meterCreditsPerUnit: 30, unitPrice: 0 }),
    ]);
    expect(transaction.amount).toBe(0);
    expect((await scope.sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Pending);
  });
}
