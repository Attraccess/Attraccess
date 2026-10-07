import {
  ResourceBillingConfiguration,
  ResourceUsage,
  ResourceUsageAction,
  User,
  BillingTransactionItem,
} from '@attraccess/database-entities';
import { HandleResourceSessionStartedEventTestScope } from './billing.service.spec';
export function registerHandleResourceSessionStartedEventCreatesZeroAmountTransactionWhenBillingFactorIs0AndInsertsANegativeBillingFactorItem(
  scope: HandleResourceSessionStartedEventTestScope,
): void {
  it('creates zero-amount transaction when billingFactor is 0% and inserts a negative BILLING_FACTOR item', async () => {
    const usage = {
      id: 17,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-09-20T09:07:00.000Z'),
      endTime: new Date('2026-09-20T09:10:00.000Z'),
      usageInMinutes: 3,
      resource: { id: 203 },
      userId: 23,
      user: {
        id: 23,
        billingFactor: 0,
      } as User,
    } as unknown as ResourceUsage;

    jest
      .spyOn(scope.service, 'getResourceBillingConfiguration')
      .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 0 } as ResourceBillingConfiguration);

    const manager = {
      findOneBy: jest.fn().mockResolvedValue(null),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest
        .fn()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation(async (entity: unknown, data: any) => {
          if (data && 'status' in data && 'amount' in data) {
            return { id: 1004, ...data };
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

    // base = 30, factor 0% -> total 0
    const transaction = await scope.service.chargeForResourceUsage(usage as ResourceUsage, manager as unknown as never);

    // Handle -0 vs 0 by checking numerically
    expect(transaction).toBeDefined();
    expect(transaction.amount).toBeCloseTo(0);

    expect(manager.save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ name: 'BILLING_FACTOR', unitPrice: -30, quantity: 1 }),
    );
  });
}
