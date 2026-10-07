import { BillingTransactionStatus, ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';
export function registerUsageLifecycleBillsExactly045For15KWhAt030KWhWithoutTouchingTheStartStopFlows(
  scope: UsageLifecycleTestScope,
): void {
  it('bills exactly 0.45 for 1.5 kWh at 0.30/kWh without touching the start/stop flows', async () => {
    await scope.seedMeter();
    const session = await scope.start();
    scope.onCollect = scope.reading('1.5');
    const ended = await scope.end();

    expect(session.meterRates).toEqual([{ meterId: 1, name: 'Energy (kWh)', creditsPerUnit: 30 }]);
    const { transaction, items: rows } = await scope.items(ended.id);
    expect(transaction).toEqual(expect.objectContaining({ amount: -45, status: BillingTransactionStatus.Completed }));
    const energy = rows.find((item) => item.name === 'Energy (kWh)');
    expect(energy).toEqual(
      expect.objectContaining({
        unitPrice: 45,
        quantity: 1,
        meterQuantity: '1.5',
        meterCreditsPerUnit: 30,
        externalReference: expect.stringMatching(/^metering:.+:.+$/),
      }),
    );
    expect(await scope.sessionOf(ended.id)).toEqual(
      expect.objectContaining({
        status: ResourceMeteringSessionStatus.Settled,
        chargeCredits: 45,
        consumedValue: '1500000000',
      }),
    );
  });
}
