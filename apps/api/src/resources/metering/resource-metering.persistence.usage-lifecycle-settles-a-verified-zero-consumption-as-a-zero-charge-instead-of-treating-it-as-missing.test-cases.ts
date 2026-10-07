import { ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';
export function registerUsageLifecycleSettlesAVerifiedZeroConsumptionAsAZeroChargeInsteadOfTreatingItAsMissing(
  scope: UsageLifecycleTestScope,
): void {
  it('settles a verified zero consumption as a zero charge instead of treating it as missing', async () => {
    await scope.seedMeter();
    await scope.start();
    scope.onCollect = scope.reading('0');
    const ended = await scope.end();
    const { items: rows } = await scope.items(ended.id);
    expect(rows.find((item) => item.name === 'Energy (kWh)')).toEqual(
      expect.objectContaining({ unitPrice: 0, meterQuantity: '0' }),
    );
    expect((await scope.sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Settled);
  });
}
