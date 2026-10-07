import {
  BillingTransaction,
  ResourceBillingConfiguration,
  ResourceUsage,
  ResourceUsageAction,
  User,
  BillingTransactionStatus,
} from '@attraccess/database-entities';
import { HandleResourceSessionStartedEventTestScope } from './billing.service.spec';
export function registerHandleResourceSessionStartedEventIncludesExistingTransactionItemsInTotalAndUpdatesExistingTransaction(
  scope: HandleResourceSessionStartedEventTestScope,
): void {
  it('includes existing transaction items in total and updates existing transaction', async () => {
    const usage = {
      id: 18,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-09-20T09:08:00.000Z'),
      endTime: new Date('2026-09-20T09:10:00.000Z'),
      usageInMinutes: 2,
      resource: { id: 204 },
      userId: 24,
      user: {
        id: 24,
        billingFactor: 100,
      } as User,
    } as unknown as ResourceUsage;

    jest
      .spyOn(scope.service, 'getResourceBillingConfiguration')
      .mockResolvedValue({ creditsPerMinute: 5, creditsPerUsage: 0 } as ResourceBillingConfiguration);

    // Existing pending transaction with additional items worth 14 (7 * 2)
    const existingTransaction = {
      id: 77,
      userId: 24,
      status: BillingTransactionStatus.Pending,
      items: [
        {
          unitPrice: 7,
          quantity: 2,
        },
      ],
    } as unknown as BillingTransaction;

    const manager = {
      // No existing completed transaction
      findOneBy: jest.fn().mockResolvedValue(null),
      // Existing pending transaction returned with items
      findOne: jest.fn().mockResolvedValue(existingTransaction),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockImplementation(async (_entity: unknown, data: unknown) => data),
    } as unknown as {
      findOneBy: jest.Mock;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findOne: jest.Mock<any, any>;
      update: jest.Mock;
      save: jest.Mock;
    };

    // base = ceil(2) * 5 = 10; plus existing items 14 => 24; factor 100% -> 24
    const transaction = await scope.service.chargeForResourceUsage(usage as ResourceUsage, manager as unknown as never);

    expect(manager.update).toHaveBeenCalledWith(BillingTransaction, 77, expect.objectContaining({ amount: -24 }));
    expect(transaction).toEqual(expect.objectContaining({ id: 77, amount: -24 }));
    expect(scope.auditService.recordBillingTransactionAfterCommit).toHaveBeenCalledWith(
      {
        transactionId: 77,
        userId: 24,
        amount: -24,
        status: BillingTransactionStatus.Completed,
        previousStatus: BillingTransactionStatus.Pending,
        source: 'resource-usage',
      },
      manager,
    );

    // No BILLING_FACTOR item because billingFactor is 100%
    const saves = (manager.save as jest.Mock).mock.calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map(([, data]: any[]) => data);
    const hasBillingFactor = saves.some((c) => c && c.name === 'BILLING_FACTOR');
    expect(hasBillingFactor).toBe(false);
  });
}
