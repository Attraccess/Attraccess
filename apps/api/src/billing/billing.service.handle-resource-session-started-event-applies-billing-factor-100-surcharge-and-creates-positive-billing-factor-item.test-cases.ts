import {
  ResourceBillingConfiguration,
  ResourceUsage,
  ResourceUsageAction,
  User,
  BillingTransactionItem,
} from '@attraccess/database-entities';
import { HandleResourceSessionStartedEventTestScope } from './billing.service.spec';
export function registerHandleResourceSessionStartedEventAppliesBillingFactor100SurchargeAndCreatesPositiveBillingFactorItem(
  scope: HandleResourceSessionStartedEventTestScope,
): void {
  it('applies billingFactor > 100% (surcharge) and creates positive BILLING_FACTOR item', async () => {
    const usage = {
      id: 16,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-09-20T09:09:00.000Z'),
      endTime: new Date('2026-09-20T09:10:00.000Z'),
      usageInMinutes: 1,
      resource: { id: 202 },
      userId: 22,
      user: {
        id: 22,
        billingFactor: 150,
      } as User,
    } as unknown as ResourceUsage;

    jest
      .spyOn(scope.service, 'getResourceBillingConfiguration')
      .mockResolvedValue({ creditsPerMinute: 20, creditsPerUsage: 0 } as ResourceBillingConfiguration);

    const manager = {
      findOneBy: jest.fn().mockResolvedValue(null),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest
        .fn()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation(async (entity: unknown, data: any) => {
          if (data && 'status' in data && 'amount' in data) {
            return { id: 1003, ...data };
          }
          return data;
        }),
    } as unknown as {
      findOneBy: jest.Mock;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findOne: jest.Mock<any, any>;
      update: jest.Mock;
      save: jest.Mock;
    };

    // base = 20, factor 150% -> total 30, surcharge item +10
    const transaction = await scope.service.chargeForResourceUsage(usage as ResourceUsage, manager as unknown as never);

    expect(transaction).toEqual(expect.objectContaining({ amount: -30 }));

    expect(manager.save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ name: 'BILLING_FACTOR', unitPrice: 10, quantity: 1 }),
    );
  });
}
