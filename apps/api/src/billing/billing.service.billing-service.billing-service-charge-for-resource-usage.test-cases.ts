import {
  BillingTransaction,
  BillingTransactionStatus,
  Resource,
  ResourceBillingConfiguration,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import { registerBillingServiceFixture } from './billing.service.billing-service.test-fixture';
export function registerBillingServiceChargeForResourceUsageCases(
  fixture: ReturnType<typeof registerBillingServiceFixture>,
) {
  describe('BillingService chargeForResourceUsage', () => {
    it('rejects recalculation when a completed transaction already exists for the usage', async () => {
      const usage = { id: 5 } as ResourceUsage;
      fixture.billingTransactionRepository.findOneBy.mockResolvedValue({
        id: 123,
        resourceUsageId: usage.id,
        status: BillingTransactionStatus.Completed,
      } as BillingTransaction);

      await expect(fixture.service.chargeForResourceUsage(usage)).rejects.toThrow(
        'Billing transaction already exists for this resource usage',
      );

      expect(fixture.billingTransactionItemRepository.manager.transaction).not.toHaveBeenCalled();
    });

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
      (fixture.billingTransactionItemRepository.manager.transaction as unknown as jest.Mock).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => {
          const result = await fn(manager);
          expect(fixture.emailService.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
          expect(fixture.liveNotificationsService.notifyTransactionUpdate).not.toHaveBeenCalled();
          committed = true;
          return result;
        },
      );
      fixture.billingTransactionRepository.findOne.mockImplementation(async () => {
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
        .spyOn(fixture.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 5 } as ResourceBillingConfiguration);

      await fixture.service.chargeForResourceUsage(usage as ResourceUsage);

      expect(fixture.emailService.sendResourceUsageBillingSummaryEmail).toHaveBeenCalledTimes(1);
      const args = (fixture.emailService.sendResourceUsageBillingSummaryEmail as jest.Mock).mock.calls[0];
      expect(args[0]).toMatchObject({ id: 10, email: 'u@example.com' });
      expect(args[2]).toMatchObject({ resource: { name: 'CNC' } });
    });

    it('does not publish an aborted or pending charge', async () => {
      fixture.billingTransactionRepository.findOne.mockResolvedValue(null);

      await fixture.service.notifyResourceUsageCharge(123);

      expect(fixture.billingTransactionRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 123, status: BillingTransactionStatus.Completed },
        }),
      );
      expect(fixture.liveNotificationsService.notifyTransactionUpdate).not.toHaveBeenCalled();
      expect(fixture.emailService.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
    });

    it('validates a tentative start without creating billing records', async () => {
      jest.spyOn(fixture.service, 'getResourceBillingConfiguration').mockResolvedValue({
        creditsPerUsage: 10,
        creditsPerMinute: 2,
      } as ResourceBillingConfiguration);
      jest.spyOn(fixture.service, 'isBillingEnabled').mockResolvedValue(true);
      jest.spyOn(fixture.service, 'getBalance').mockResolvedValue(12);

      await fixture.service.validateResourceUsageStart(
        1,
        { sessionDurationCreditsPerMinute: 2 } as ResourceUsage,
        { id: 7 } as User,
      );

      expect(fixture.billingTransactionRepository.save).not.toHaveBeenCalled();
      expect(fixture.auditService.recordBillingTransactionAfterCommit).not.toHaveBeenCalled();
      expect(fixture.liveNotificationsService.notifyTransactionUpdate).not.toHaveBeenCalled();
    });

    it('does not turn a committed lifecycle into a failure when charge publication fails', async () => {
      fixture.billingTransactionRepository.findOne.mockRejectedValue(new Error('Read unavailable'));

      await expect(fixture.service.notifyResourceUsageCharge(123)).resolves.toBeUndefined();

      expect(fixture.emailService.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
    });
  });
}
