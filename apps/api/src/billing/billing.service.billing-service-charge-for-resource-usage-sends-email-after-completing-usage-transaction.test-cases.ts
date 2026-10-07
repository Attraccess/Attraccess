import {
  BillingTransaction,
  ResourceBillingConfiguration,
  ResourceUsage,
  User,
  Resource,
  BillingTransactionStatus,
} from '@attraccess/database-entities';
import { BillingServiceChargeForResourceUsageTestScope } from './billing.service.spec';
export function registerBillingServiceChargeForResourceUsageSendsEmailAfterCompletingUsageTransaction(
  scope: BillingServiceChargeForResourceUsageTestScope,
): void {
  it('sends email after completing usage transaction', async () => {
    let committed = false;
    const usage: Partial<ResourceUsage> = {
      id: 5,
      usageInMinutes: 10,
      resource: { id: 1, name: 'CNC' } as Resource,
      user: { id: 10, billingFactor: 100 } as User,
    };

    // emulate manager path inside transaction()
    const manager = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findOne: jest.fn().mockImplementation((entity: any, opts: any) => {
        if (entity === BillingTransaction) {
          if (opts?.where?.resourceUsageId === usage.id) return null; // no existing
          if (opts?.where?.id)
            return {
              id: opts.where.id,
              userId: 10,
              amount: -150,
              status: BillingTransactionStatus.Completed,
              items: [],
            };
        }
        if (entity === User) {
          return { id: 10, email: 'u@example.com', creditBalance: 1000 };
        }
        return null;
      }),
      getRepository: jest.fn(() => ({
        findOneBy: jest.fn().mockResolvedValue(null),
        create: jest.fn((data: unknown) => data),
        save: jest.fn(async (data: unknown) => data),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      save: jest.fn().mockImplementation((entity: any, payload: any) => {
        if (entity === BillingTransaction) {
          return { id: 123, ...payload };
        }
        return payload;
      }),
      update: jest.fn(),
    };

    // Publishing must happen after the transaction wrapper has committed.
    (scope.billingTransactionItemRepository.manager.transaction as unknown as jest.Mock).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (fn: any) => {
        const result = await fn(manager);
        expect(scope.emailService.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
        expect(scope.liveNotificationsService.notifyTransactionUpdate).not.toHaveBeenCalled();
        committed = true;
        return result;
      },
    );
    scope.billingTransactionRepository.findOne.mockImplementation(async () => {
      expect(committed).toBe(true);
      return {
        id: 123,
        amount: -105,
        status: BillingTransactionStatus.Completed,
        user: { id: 10, email: 'u@example.com' },
        resourceUsage: usage,
        items: [],
      } as unknown as BillingTransaction;
    });

    jest
      .spyOn(scope.service, 'getResourceBillingConfiguration')
      .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 5 } as ResourceBillingConfiguration);

    await scope.service.chargeForResourceUsage(usage as ResourceUsage);

    expect(scope.emailService.sendResourceUsageBillingSummaryEmail).toHaveBeenCalledTimes(1);
    const args = (scope.emailService.sendResourceUsageBillingSummaryEmail as jest.Mock).mock.calls[0];
    expect(args[0]).toMatchObject({ id: 10, email: 'u@example.com' });
    expect(args[2]).toMatchObject({ resource: { name: 'CNC' } });
  });
}
