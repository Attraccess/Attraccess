import {
  BillingTransactionItem,
  ResourceBillingConfiguration,
  ResourceUsage,
  User,
  BillingTransaction,
  BillingTransactionStatus,
} from '@attraccess/database-entities';
import { registerBillingServiceFixture } from './billing.service.billing-service.test-fixture';
import { InsufficientBalanceError } from './errors/insufficient-balance.error';

export function registerGetResourceBillingConfigurationCases(
  fixture: ReturnType<typeof registerBillingServiceFixture>,
) {
  describe('getResourceBillingConfiguration', () => {
    it('creates and saves default configuration when none exists', async () => {
      fixture.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(null);
      const created = { resourceId: 42, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;
      fixture.resourceBillingConfigurationRepository.create.mockReturnValue(created);
      fixture.resourceBillingConfigurationRepository.save.mockResolvedValue(created);

      const result = await fixture.service.getResourceBillingConfiguration(42);
      expect(fixture.resourceBillingConfigurationRepository.create).toHaveBeenCalledWith({
        resourceId: 42,
        creditsPerUsage: 0,
        creditsPerMinute: 0,
        creditsPerOperatingMinute: 0,
        creditsPerKwh: 0,
      });
      expect(fixture.resourceBillingConfigurationRepository.save).toHaveBeenCalledWith(created);
      expect(result).toBe(created);
    });

    it('returns existing configuration when present', async () => {
      const existing = { resourceId: 7, creditsPerUsage: 1, creditsPerMinute: 2 } as ResourceBillingConfiguration;
      fixture.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(existing);

      const result = await fixture.service.getResourceBillingConfiguration(7);
      expect(fixture.resourceBillingConfigurationRepository.findOneBy).toHaveBeenCalledWith({ resourceId: 7 });
      expect(result).toBe(existing);
    });

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
        .spyOn(fixture.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 99, creditsPerUsage: 0 } as ResourceBillingConfiguration);
      const manager = {
        findOneBy: jest.fn().mockResolvedValue(null),
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(async (_entity: unknown, data: Record<string, unknown>) =>
          'amount' in data ? { id: 1005, ...data } : data,
        ),
      } as unknown as never;

      const transaction = await fixture.service.chargeForResourceUsage(usage, manager);

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
  });
}

export function registerGetTransactionCases(fixture: ReturnType<typeof registerBillingServiceFixture>) {
  describe('getTransaction', () => {
    it('restricts transaction lookup to its owner', async () => {
      fixture.billingTransactionRepository.findOne.mockResolvedValue(null);

      expect(await fixture.service.getTransaction(123, 2)).toBeNull();
      expect(fixture.billingTransactionRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 123, userId: 2 } }),
      );
    });
  });
}

export function registerHandleResourceUsageStartCases(fixture: ReturnType<typeof registerBillingServiceFixture>) {
  describe('handleResourceUsageStart', () => {
    it('validates the frozen fixed fee after pricing changes during a start flow', async () => {
      const usage = {
        id: 22,
        creditsPerUsage: 5,
        sessionDurationCreditsPerMinute: 3,
        operatingDurationCreditsPerMinute: 7,
      } as ResourceUsage;
      jest.spyOn(fixture.service, 'getResourceBillingConfiguration').mockResolvedValue({
        creditsPerUsage: 99,
        creditsPerMinute: 99,
        creditsPerOperatingMinute: 99,
      } as ResourceBillingConfiguration);
      jest.spyOn(fixture.service, 'getBalance').mockResolvedValue(8);

      await expect(fixture.service.validateResourceUsageStart(205, usage, { id: 25 } as User)).resolves.toBeUndefined();

      jest.spyOn(fixture.service, 'getResourceBillingConfiguration').mockResolvedValue({
        creditsPerUsage: 0,
        creditsPerMinute: 0,
        creditsPerOperatingMinute: 0,
      } as ResourceBillingConfiguration);
      jest.spyOn(fixture.service, 'getBalance').mockResolvedValue(7);
      await expect(fixture.service.validateResourceUsageStart(205, usage, { id: 25 } as User)).rejects.toBeInstanceOf(
        InsufficientBalanceError,
      );
    });

    it('does not reserve an operating-minute charge that may not be incurred', async () => {
      const usage = {
        id: 22,
        sessionDurationCreditsPerMinute: 3,
        operatingDurationCreditsPerMinute: 7,
      } as ResourceUsage;
      const user = { id: 25 } as User;

      jest.spyOn(fixture.service, 'getResourceBillingConfiguration').mockResolvedValue({
        creditsPerUsage: 5,
        creditsPerMinute: 3,
        creditsPerOperatingMinute: 7,
      } as ResourceBillingConfiguration);
      jest.spyOn(fixture.service, 'isBillingEnabled').mockResolvedValue(true);
      jest.spyOn(fixture.service, 'getBalance').mockResolvedValue(8);
      fixture.billingTransactionRepository.save.mockResolvedValue({
        id: 55,
        userId: user.id,
        resourceUsageId: usage.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      } as BillingTransaction);

      await expect(fixture.service.handleResourceUsageStart(205, usage, user)).resolves.toBeUndefined();
      expect(fixture.billingTransactionRepository.save).toHaveBeenCalledWith({
        userId: user.id,
        resourceUsageId: usage.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      });
    });
  });
}

export function registerRejectsAbsentTransactionsAndInvalidRefundAmountsBeforeWritingCases(
  fixture: ReturnType<typeof registerBillingServiceFixture>,
) {
  it('rejects absent transactions and invalid refund amounts before writing', async () => {
    const get = jest.spyOn(fixture.service, 'getTransaction').mockResolvedValue(null);
    await expect(fixture.service.refundTransaction(9, 4, { amount: 25 })).rejects.toThrow();
    get.mockResolvedValue({ id: 4, amount: -100 } as BillingTransaction);
    await expect(fixture.service.refundTransaction(9, 4, { amount: 0 })).rejects.toThrow(
      'Amount must be greater than 0',
    );
    await expect(fixture.service.refundTransaction(9, 4, { amount: 101 })).rejects.toThrow();
    expect(fixture.billingTransactionRepository.save).not.toHaveBeenCalled();
  });
}

export function registerShouldBeDefinedCases(fixture: ReturnType<typeof registerBillingServiceFixture>) {
  it('should be defined', () => {
    expect(fixture.service).toBeDefined();
  });
}
