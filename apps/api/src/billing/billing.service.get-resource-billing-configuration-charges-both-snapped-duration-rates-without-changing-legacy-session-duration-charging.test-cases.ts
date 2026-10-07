import {
  ResourceBillingConfiguration,
  ResourceUsage,
  User,
  BillingTransactionItem,
} from '@attraccess/database-entities';
import { GetResourceBillingConfigurationTestScope } from './billing.service.spec';
export function registerGetResourceBillingConfigurationChargesBothSnappedDurationRatesWithoutChangingLegacySessionDurationCharging(
  scope: GetResourceBillingConfigurationTestScope,
): void {
  it('charges both snapped duration rates without changing legacy session-duration charging', async () => {
    const usage = {
      id: 22,
      startTime: new Date('2026-09-20T09:07:54.000Z'),
      endTime: new Date('2026-09-20T09:10:00.000Z'),
      usageInMinutes: 2.1,
      attributedOperatingDurationInMinutes: 1.1,
      sessionDurationCreditsPerMinute: 3,
      operatingDurationCreditsPerMinute: 7,
      resource: { id: 205 },
      userId: 25,
      user: { id: 25, billingFactor: 100 } as User,
    } as ResourceUsage;
    jest
      .spyOn(scope.service, 'getResourceBillingConfiguration')
      .mockResolvedValue({ creditsPerMinute: 99, creditsPerUsage: 0 } as ResourceBillingConfiguration);
    const manager = {
      findOneBy: jest.fn().mockResolvedValue(null),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (_entity: unknown, data: Record<string, unknown>) =>
        'amount' in data ? { id: 1005, ...data } : data,
      ),
    } as unknown as never;

    const transaction = await scope.service.chargeForResourceUsage(usage, manager);

    expect(transaction).toEqual(expect.objectContaining({ amount: -23 }));
    expect((manager as { save: jest.Mock }).save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ name: 'PER_MINUTE', unitPrice: 3, quantity: 3 }),
    );
    expect((manager as { save: jest.Mock }).save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE', unitPrice: 7, quantity: 2 }),
    );
  });
}
