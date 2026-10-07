import {
  ResourceBillingConfiguration,
  ResourceUsage,
  ResourceUsageAction,
  User,
  BillingTransactionItem,
} from '@attraccess/database-entities';
import { HandleResourceSessionStartedEventTestScope } from './billing.service.spec';
export function registerHandleResourceSessionStartedEventAppliesBillingFactor100DiscountAndCreatesBillingFactorItem(
  scope: HandleResourceSessionStartedEventTestScope,
): void {
  it('applies billingFactor < 100% (discount) and creates BILLING_FACTOR item', async () => {
    const usage = {
      id: 14,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-09-20T09:08:00.000Z'),
      endTime: new Date('2026-09-20T09:10:00.000Z'),
      usageInMinutes: 2,
      resource: { id: 200 },
      userId: 20,
      user: {
        id: 20,
        billingFactor: 50,
      } as User,
    } as unknown as ResourceUsage;

    jest
      .spyOn(scope.service, 'getResourceBillingConfiguration')
      .mockResolvedValue({ creditsPerMinute: 20, creditsPerUsage: 0 } as ResourceBillingConfiguration);

    // Custom manager to capture saves/updates
    const manager = {
      findOneBy: jest.fn().mockResolvedValue(null),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest
        .fn()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation(async (entity: unknown, data: any) => {
          if (data && 'status' in data && 'amount' in data) {
            return { id: 1001, ...data };
          }
          return data;
        }),
      getRepository: jest.fn(() => ({ findOneBy: jest.fn(), create: jest.fn(), save: jest.fn() })),
    } as unknown as {
      findOneBy: jest.Mock;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findOne: jest.Mock<any, any>;
      update: jest.Mock;
      save: jest.Mock;
      getRepository: jest.Mock;
    };

    // ceil(2) = 2 -> 2 * 20 + 0 = 40 credits; billingFactor 50% -> 20
    const transaction = await scope.service.chargeForResourceUsage(usage as ResourceUsage, manager as unknown as never);

    expect(scope.service.getResourceBillingConfiguration).toHaveBeenCalledWith(200, expect.any(Object));
    expect(transaction).toEqual(expect.objectContaining({ amount: -20 }));

    // Ensure BILLING_FACTOR item saved with the discount as a negative unit price
    expect(manager.save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ name: 'BILLING_FACTOR', unitPrice: -20, quantity: 1 }),
    );

    // Ensure base items were saved
    expect(manager.save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ name: 'PER_SESSION', unitPrice: 0, quantity: 1 }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ name: 'PER_MINUTE', unitPrice: 20, quantity: 2 }),
    );
  });
}
