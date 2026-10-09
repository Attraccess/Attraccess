import {
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  Resource,
  ResourceBillingConfiguration,
  ResourceUsage,
  Setting,
  User,
} from '@attraccess/database-entities';

import { BadRequestException } from '@nestjs/common';

import { inheritTestScope } from '../../test-utils/inherit-test-scope';

import { resetTestFixture } from './fixtures/setup.test-fixture';

import { createBillingServiceChargeForResourceUsageFixture } from './fixtures/resource-usage.test-fixture';

import { createBillingServiceFixture } from './fixtures/service.test-fixture';

import { Currency } from '../dto/set-configuration.dto';

import { InsufficientBalanceError } from '../errors/insufficient-balance.error';

import { ResourceBillingConfigurationNotFoundException } from '../errors/resource-billing-configuration-not-found.error';

export type BillingServiceTestScope = ReturnType<typeof createBillingServiceFixture>;

export type BillingServiceChargeForResourceUsageTestScope = ReturnType<
  typeof createBillingServiceChargeForResourceUsageFixture
>;

describe('BillingService', () => {
  const scope = createBillingServiceFixture();

  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  describe('getResourceBillingConfiguration', () => {
    const getResourceBillingConfigurationScope = inheritTestScope(
      {
        get resourceBillingConfigurationRepository() {
          return scope.resourceBillingConfigurationRepository;
        },
        set resourceBillingConfigurationRepository(value: typeof scope.resourceBillingConfigurationRepository) {
          scope.resourceBillingConfigurationRepository = value;
        },
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
      },
      scope,
    );

    it('creates and saves default configuration when none exists', async () => {
      getResourceBillingConfigurationScope.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(null);
      const created = { resourceId: 42, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;
      getResourceBillingConfigurationScope.resourceBillingConfigurationRepository.create.mockReturnValue(created);
      getResourceBillingConfigurationScope.resourceBillingConfigurationRepository.save.mockResolvedValue(created);

      const result = await getResourceBillingConfigurationScope.service.getResourceBillingConfiguration(42);
      expect(getResourceBillingConfigurationScope.resourceBillingConfigurationRepository.create).toHaveBeenCalledWith({
        resourceId: 42,
        creditsPerUsage: 0,
        creditsPerMinute: 0,
        creditsPerOperatingMinute: 0,
      });
      expect(getResourceBillingConfigurationScope.resourceBillingConfigurationRepository.save).toHaveBeenCalledWith(
        created,
      );
      expect(result).toBe(created);
    });

    it('returns existing configuration when present', async () => {
      const existing = { resourceId: 7, creditsPerUsage: 1, creditsPerMinute: 2 } as ResourceBillingConfiguration;
      getResourceBillingConfigurationScope.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(existing);

      const result = await getResourceBillingConfigurationScope.service.getResourceBillingConfiguration(7);
      expect(
        getResourceBillingConfigurationScope.resourceBillingConfigurationRepository.findOneBy,
      ).toHaveBeenCalledWith({ resourceId: 7 });
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
        .spyOn(getResourceBillingConfigurationScope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 99, creditsPerUsage: 0 } as ResourceBillingConfiguration);
      const manager = {
        findOneBy: jest.fn().mockResolvedValue(null),
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(async (_entity: unknown, data: Record<string, unknown>) =>
          'amount' in data ? { id: 1005, ...data } : data,
        ),
      } as unknown as never;

      const transaction = await getResourceBillingConfigurationScope.service.chargeForResourceUsage(usage, manager);

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

  describe('handleResourceUsageStart', () => {
    const handleResourceUsageStartScope = inheritTestScope(
      {
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
        get billingTransactionRepository() {
          return scope.billingTransactionRepository;
        },
        set billingTransactionRepository(value: typeof scope.billingTransactionRepository) {
          scope.billingTransactionRepository = value;
        },
      },
      scope,
    );

    it('validates the frozen fixed fee after pricing changes during a start flow', async () => {
      const usage = {
        id: 22,
        creditsPerUsage: 5,
        sessionDurationCreditsPerMinute: 3,
        operatingDurationCreditsPerMinute: 7,
      } as ResourceUsage;
      jest.spyOn(handleResourceUsageStartScope.service, 'getResourceBillingConfiguration').mockResolvedValue({
        creditsPerUsage: 99,
        creditsPerMinute: 99,
        creditsPerOperatingMinute: 99,
      } as ResourceBillingConfiguration);
      jest.spyOn(handleResourceUsageStartScope.service, 'getBalance').mockResolvedValue(8);

      await expect(
        handleResourceUsageStartScope.service.validateResourceUsageStart(205, usage, { id: 25 } as User),
      ).resolves.toBeUndefined();

      jest.spyOn(handleResourceUsageStartScope.service, 'getResourceBillingConfiguration').mockResolvedValue({
        creditsPerUsage: 0,
        creditsPerMinute: 0,
        creditsPerOperatingMinute: 0,
      } as ResourceBillingConfiguration);
      jest.spyOn(handleResourceUsageStartScope.service, 'getBalance').mockResolvedValue(7);
      await expect(
        handleResourceUsageStartScope.service.validateResourceUsageStart(205, usage, { id: 25 } as User),
      ).rejects.toBeInstanceOf(InsufficientBalanceError);
    });

    it('does not reserve an operating-minute charge that may not be incurred', async () => {
      const usage = {
        id: 22,
        sessionDurationCreditsPerMinute: 3,
        operatingDurationCreditsPerMinute: 7,
      } as ResourceUsage;
      const user = { id: 25 } as User;

      jest.spyOn(handleResourceUsageStartScope.service, 'getResourceBillingConfiguration').mockResolvedValue({
        creditsPerUsage: 5,
        creditsPerMinute: 3,
        creditsPerOperatingMinute: 7,
      } as ResourceBillingConfiguration);
      jest.spyOn(handleResourceUsageStartScope.service, 'isBillingEnabled').mockResolvedValue(true);
      jest.spyOn(handleResourceUsageStartScope.service, 'getBalance').mockResolvedValue(8);
      handleResourceUsageStartScope.billingTransactionRepository.save.mockResolvedValue({
        id: 55,
        userId: user.id,
        resourceUsageId: usage.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      } as BillingTransaction);

      await expect(
        handleResourceUsageStartScope.service.handleResourceUsageStart(205, usage, user),
      ).resolves.toBeUndefined();
      expect(handleResourceUsageStartScope.billingTransactionRepository.save).toHaveBeenCalledWith({
        userId: user.id,
        resourceUsageId: usage.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      });
    });
  });

  describe('updateResourceBillingConfiguration', () => {
    const updateResourceBillingConfigurationScope = inheritTestScope(
      {
        get resourceBillingConfigurationRepository() {
          return scope.resourceBillingConfigurationRepository;
        },
        set resourceBillingConfigurationRepository(value: typeof scope.resourceBillingConfigurationRepository) {
          scope.resourceBillingConfigurationRepository = value;
        },
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
      },
      scope,
    );

    it('throws when configuration not found', async () => {
      updateResourceBillingConfigurationScope.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(null);
      await expect(
        updateResourceBillingConfigurationScope.service.updateResourceBillingConfiguration(1, {
          creditsPerUsage: 1,
          creditsPerMinute: 1,
        }),
      ).rejects.toBeInstanceOf(ResourceBillingConfigurationNotFoundException);
    });

    it('throws when creditsPerMinute is negative', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;

      updateResourceBillingConfigurationScope.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);
      await expect(
        updateResourceBillingConfigurationScope.service.updateResourceBillingConfiguration(1, { creditsPerMinute: -1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when creditsPerUsage is negative', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;

      updateResourceBillingConfigurationScope.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);
      await expect(
        updateResourceBillingConfigurationScope.service.updateResourceBillingConfiguration(1, { creditsPerUsage: -1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('coerces nulls to 0 and saves', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 5, creditsPerMinute: 6 } as ResourceBillingConfiguration;

      updateResourceBillingConfigurationScope.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);
      updateResourceBillingConfigurationScope.resourceBillingConfigurationRepository.save.mockImplementation(
        async (arg) => arg as ResourceBillingConfiguration,
      );

      const result = await updateResourceBillingConfigurationScope.service.updateResourceBillingConfiguration(1, {
        creditsPerUsage: null,
        creditsPerMinute: null,
      });

      expect(updateResourceBillingConfigurationScope.resourceBillingConfigurationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ creditsPerUsage: 0, creditsPerMinute: 0 }),
      );
      expect(result.creditsPerUsage).toBe(0);
      expect(result.creditsPerMinute).toBe(0);
    });

    it('throws on fractional values', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;
      updateResourceBillingConfigurationScope.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);

      await expect(
        updateResourceBillingConfigurationScope.service.updateResourceBillingConfiguration(1, { creditsPerUsage: 1.5 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        updateResourceBillingConfigurationScope.service.updateResourceBillingConfiguration(1, {
          creditsPerMinute: 2.2,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('treats a captured meter rate alone as billing being enabled', async () => {
      jest.spyOn(updateResourceBillingConfigurationScope.service, 'getResourceBillingConfiguration').mockResolvedValue({
        creditsPerUsage: 0,
        creditsPerMinute: 0,
        creditsPerOperatingMinute: 0,
      } as ResourceBillingConfiguration);
      await expect(
        updateResourceBillingConfigurationScope.service.isBillingEnabled(1, undefined, {
          meterRates: [{ meterId: 1, name: 'Heartbeat', creditsPerUnit: 3 }],
        } as ResourceUsage),
      ).resolves.toBe(true);
    });

    it('allows partial update without validating undefined fields', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 1, creditsPerMinute: 2 } as ResourceBillingConfiguration;

      updateResourceBillingConfigurationScope.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);
      updateResourceBillingConfigurationScope.resourceBillingConfigurationRepository.save.mockImplementation(
        async (arg) => arg as ResourceBillingConfiguration,
      );

      const result = await updateResourceBillingConfigurationScope.service.updateResourceBillingConfiguration(1, {
        creditsPerUsage: 3,
      });
      expect(result.creditsPerUsage).toBe(3);
      expect(result.creditsPerMinute).toBe(2);
    });
  });

  describe('configuration currency', () => {
    const configurationCurrencyScope = inheritTestScope(
      {
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
        get settingRepository() {
          return scope.settingRepository;
        },
        set settingRepository(value: typeof scope.settingRepository) {
          scope.settingRepository = value;
        },
      },
      scope,
    );

    it('setConfiguration throws on invalid currency', async () => {
      await expect(
        configurationCurrencyScope.service.setConfiguration({ currency: 'USD' as Currency }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('setConfiguration updates existing currency setting and returns configuration', async () => {
      configurationCurrencyScope.settingRepository.findOneBy.mockResolvedValueOnce({
        id: 1,
        parent: 'billing',
        key: 'currency',
        value: 'EUR',
      } as Setting);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      configurationCurrencyScope.settingRepository.update.mockResolvedValue({} as any);
      // getConfiguration call
      configurationCurrencyScope.settingRepository.findOneBy.mockResolvedValueOnce({
        id: 1,
        parent: 'billing',
        key: 'currency',
        value: 'EUR',
      } as Setting);

      const result = await configurationCurrencyScope.service.setConfiguration({ currency: Currency.EUR });
      expect(configurationCurrencyScope.settingRepository.update).toHaveBeenCalledWith(1, { value: Currency.EUR });
      expect(result).toEqual({ currency: Currency.EUR, minorUnit: 2 });
    });

    it('setConfiguration inserts currency when not existing and returns configuration', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      configurationCurrencyScope.settingRepository.findOneBy.mockResolvedValueOnce(null as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      configurationCurrencyScope.settingRepository.insert.mockResolvedValue({} as any);
      // getConfiguration call
      configurationCurrencyScope.settingRepository.findOneBy.mockResolvedValueOnce({
        id: 2,
        parent: 'billing',
        key: 'currency',
        value: 'EUR',
      } as Setting);

      const result = await configurationCurrencyScope.service.setConfiguration({ currency: Currency.EUR });
      expect(configurationCurrencyScope.settingRepository.insert).toHaveBeenCalledWith({
        parent: 'billing',
        key: 'currency',
        value: Currency.EUR,
      });
      expect(result).toEqual({ currency: Currency.EUR, minorUnit: 2 });
    });

    it('getConfiguration returns defaults when no setting present', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      configurationCurrencyScope.settingRepository.findOneBy.mockResolvedValue(null as any);
      const result = await configurationCurrencyScope.service.getConfiguration();
      expect(result).toEqual({ currency: Currency.EUR, minorUnit: 2 });
    });

    it('getConfiguration throws on unsupported currency value from DB', async () => {
      configurationCurrencyScope.settingRepository.findOneBy.mockResolvedValue({ value: 'USD' } as Setting);
      await expect(configurationCurrencyScope.service.getConfiguration()).rejects.toBeInstanceOf(Error);
    });
  });

  describe('BillingService chargeForResourceUsage', () => {
    const billingServiceChargeForResourceUsageScope = createBillingServiceChargeForResourceUsageFixture(scope);

    it('rejects recalculation when a completed transaction already exists for the usage', async () => {
      const usage = { id: 5 } as ResourceUsage;
      billingServiceChargeForResourceUsageScope.billingTransactionRepository.findOneBy.mockResolvedValue({
        id: 123,
        resourceUsageId: usage.id,
        status: BillingTransactionStatus.Completed,
      } as BillingTransaction);

      await expect(billingServiceChargeForResourceUsageScope.service.chargeForResourceUsage(usage)).rejects.toThrow(
        'Billing transaction already exists for this resource usage',
      );

      expect(
        billingServiceChargeForResourceUsageScope.billingTransactionItemRepository.manager.transaction,
      ).not.toHaveBeenCalled();
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
      (
        billingServiceChargeForResourceUsageScope.billingTransactionItemRepository.manager
          .transaction as unknown as jest.Mock
      ).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => {
          const result = await fn(manager);
          expect(
            billingServiceChargeForResourceUsageScope.emailService.sendResourceUsageBillingSummaryEmail,
          ).not.toHaveBeenCalled();
          expect(
            billingServiceChargeForResourceUsageScope.liveNotificationsService.notifyTransactionUpdate,
          ).not.toHaveBeenCalled();
          committed = true;
          return result;
        },
      );
      billingServiceChargeForResourceUsageScope.billingTransactionRepository.findOne.mockImplementation(async () => {
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
        .spyOn(billingServiceChargeForResourceUsageScope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 5 } as ResourceBillingConfiguration);

      await billingServiceChargeForResourceUsageScope.service.chargeForResourceUsage(usage as ResourceUsage);

      expect(
        billingServiceChargeForResourceUsageScope.emailService.sendResourceUsageBillingSummaryEmail,
      ).toHaveBeenCalledTimes(1);
      const args = (
        billingServiceChargeForResourceUsageScope.emailService.sendResourceUsageBillingSummaryEmail as jest.Mock
      ).mock.calls[0];
      expect(args[0]).toMatchObject({ id: 10, email: 'u@example.com' });
      expect(args[2]).toMatchObject({ resource: { name: 'CNC' } });
    });

    it('does not publish an aborted or pending charge', async () => {
      billingServiceChargeForResourceUsageScope.billingTransactionRepository.findOne.mockResolvedValue(null);

      await billingServiceChargeForResourceUsageScope.service.notifyResourceUsageCharge(123);

      expect(billingServiceChargeForResourceUsageScope.billingTransactionRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 123, status: BillingTransactionStatus.Completed },
        }),
      );
      expect(
        billingServiceChargeForResourceUsageScope.liveNotificationsService.notifyTransactionUpdate,
      ).not.toHaveBeenCalled();
      expect(
        billingServiceChargeForResourceUsageScope.emailService.sendResourceUsageBillingSummaryEmail,
      ).not.toHaveBeenCalled();
    });

    it('validates a tentative start without creating billing records', async () => {
      jest
        .spyOn(billingServiceChargeForResourceUsageScope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({
          creditsPerUsage: 10,
          creditsPerMinute: 2,
        } as ResourceBillingConfiguration);
      jest.spyOn(billingServiceChargeForResourceUsageScope.service, 'isBillingEnabled').mockResolvedValue(true);
      jest.spyOn(billingServiceChargeForResourceUsageScope.service, 'getBalance').mockResolvedValue(12);

      await billingServiceChargeForResourceUsageScope.service.validateResourceUsageStart(
        1,
        { sessionDurationCreditsPerMinute: 2 } as ResourceUsage,
        { id: 7 } as User,
      );

      expect(billingServiceChargeForResourceUsageScope.billingTransactionRepository.save).not.toHaveBeenCalled();
      expect(
        billingServiceChargeForResourceUsageScope.auditService.recordBillingTransactionAfterCommit,
      ).not.toHaveBeenCalled();
      expect(
        billingServiceChargeForResourceUsageScope.liveNotificationsService.notifyTransactionUpdate,
      ).not.toHaveBeenCalled();
    });

    it('does not turn a committed lifecycle into a failure when charge publication fails', async () => {
      billingServiceChargeForResourceUsageScope.billingTransactionRepository.findOne.mockRejectedValue(
        new Error('Read unavailable'),
      );

      await expect(
        billingServiceChargeForResourceUsageScope.service.notifyResourceUsageCharge(123),
      ).resolves.toBeUndefined();

      expect(
        billingServiceChargeForResourceUsageScope.emailService.sendResourceUsageBillingSummaryEmail,
      ).not.toHaveBeenCalled();
    });
  });
});
