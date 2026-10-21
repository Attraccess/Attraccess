import {
  BillingTransaction,
  BillingTransactionStatus,
  Resource,
  ResourceBillingConfiguration,
  ResourceUsage,
  User,
} from '@attraccess/application-models';

import { BadRequestException } from '@nestjs/common';

import { billingOperationsFake, billingTransactionsFake } from './fixtures/operations.test-fixture';

import { resetTestFixture } from './fixtures/setup.test-fixture';

import { createBillingServiceFixture } from './fixtures/service.test-fixture';

import { Currency } from '../dto/set-configuration.dto';

import { InsufficientBalanceError } from '../errors/insufficient-balance.error';

import { ResourceBillingConfigurationNotFoundException } from '../errors/resource-billing-configuration-not-found.error';

export type BillingServiceTestScope = ReturnType<typeof createBillingServiceFixture>;

describe('BillingService', () => {
  const scope = createBillingServiceFixture();

  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  describe('getResourceBillingConfiguration', () => {
    it('creates and saves default configuration when none exists', async () => {
      scope.persistence.resourceConfiguration.mockResolvedValue(null);
      const created = {
        resourceId: 42,
        creditsPerUsage: 0,
        creditsPerMinute: 0,
        creditsPerOperatingMinute: 0,
      } as ResourceBillingConfiguration;
      scope.persistence.saveResourceConfiguration.mockResolvedValue(created);

      const result = await scope.service.getResourceBillingConfiguration(42);
      expect(scope.persistence.saveResourceConfiguration).toHaveBeenCalledWith(created);
      expect(result).toEqual(created);
    });

    it('returns existing configuration when present', async () => {
      const existing = { resourceId: 7, creditsPerUsage: 1, creditsPerMinute: 2 } as ResourceBillingConfiguration;
      scope.persistence.resourceConfiguration.mockResolvedValue(existing);

      const result = await scope.service.getResourceBillingConfiguration(7);
      expect(scope.persistence.resourceConfiguration).toHaveBeenCalledWith(7);
      expect(result).toEqual(existing);
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
        .spyOn(scope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 99, creditsPerUsage: 0 } as ResourceBillingConfiguration);
      const operations = billingOperationsFake();

      const transaction = await billingTransactionsFake(operations).transactions.run(
        { resourceIds: [205], accountIds: [25] },
        (transaction) => scope.service.chargeForResourceUsage(usage, transaction),
      );

      expect(transaction).toEqual(expect.objectContaining({ amount: -23 }));
      expect(operations.saveItem).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'PER_MINUTE', unitPrice: 3, quantity: 3 }),
      );
      expect(operations.saveItem).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE', unitPrice: 7, quantity: 2 }),
      );
    });
  });

  describe('handleResourceUsageStart', () => {
    it('validates the frozen fixed fee after pricing changes during a start flow', async () => {
      const usage = {
        id: 22,
        creditsPerUsage: 5,
        sessionDurationCreditsPerMinute: 3,
        operatingDurationCreditsPerMinute: 7,
      } as ResourceUsage;
      jest.spyOn(scope.service, 'getResourceBillingConfiguration').mockResolvedValue({
        creditsPerUsage: 99,
        creditsPerMinute: 99,
        creditsPerOperatingMinute: 99,
      } as ResourceBillingConfiguration);
      jest.spyOn(scope.service, 'getBalance').mockResolvedValue(8);

      await expect(scope.service.validateResourceUsageStart(205, usage, { id: 25 } as User)).resolves.toBeUndefined();

      jest.spyOn(scope.service, 'getResourceBillingConfiguration').mockResolvedValue({
        creditsPerUsage: 0,
        creditsPerMinute: 0,
        creditsPerOperatingMinute: 0,
      } as ResourceBillingConfiguration);
      jest.spyOn(scope.service, 'getBalance').mockResolvedValue(7);
      await expect(scope.service.validateResourceUsageStart(205, usage, { id: 25 } as User)).rejects.toBeInstanceOf(
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

      jest.spyOn(scope.service, 'getResourceBillingConfiguration').mockResolvedValue({
        creditsPerUsage: 5,
        creditsPerMinute: 3,
        creditsPerOperatingMinute: 7,
      } as ResourceBillingConfiguration);
      jest.spyOn(scope.service, 'isBillingEnabled').mockResolvedValue(true);
      jest.spyOn(scope.service, 'getBalance').mockResolvedValue(8);
      scope.persistence.createTransaction.mockResolvedValue({
        id: 55,
        userId: user.id,
        resourceUsageId: usage.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      } as BillingTransaction);

      await expect(scope.service.handleResourceUsageStart(205, usage, user)).resolves.toBeUndefined();
      expect(scope.persistence.createTransaction).toHaveBeenCalledWith({
        userId: user.id,
        resourceUsageId: usage.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      });
    });
  });

  describe('updateResourceBillingConfiguration', () => {
    it('throws when configuration not found', async () => {
      scope.persistence.resourceConfiguration.mockResolvedValue(null);
      await expect(
        scope.service.updateResourceBillingConfiguration(1, {
          creditsPerUsage: 1,
          creditsPerMinute: 1,
        }),
      ).rejects.toBeInstanceOf(ResourceBillingConfigurationNotFoundException);
    });

    it('throws when creditsPerMinute is negative', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;

      scope.persistence.resourceConfiguration.mockResolvedValue(cfg);
      await expect(
        scope.service.updateResourceBillingConfiguration(1, { creditsPerMinute: -1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when creditsPerUsage is negative', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;

      scope.persistence.resourceConfiguration.mockResolvedValue(cfg);
      await expect(scope.service.updateResourceBillingConfiguration(1, { creditsPerUsage: -1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('coerces nulls to 0 and saves', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 5, creditsPerMinute: 6 } as ResourceBillingConfiguration;

      scope.persistence.resourceConfiguration.mockResolvedValue(cfg);
      scope.persistence.saveResourceConfiguration.mockImplementation(
        async (arg) => arg as ResourceBillingConfiguration,
      );

      const result = await scope.service.updateResourceBillingConfiguration(1, {
        creditsPerUsage: null,
        creditsPerMinute: null,
      });

      expect(scope.persistence.saveResourceConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({ creditsPerUsage: 0, creditsPerMinute: 0 }),
      );
      expect(result.creditsPerUsage).toBe(0);
      expect(result.creditsPerMinute).toBe(0);
    });

    it('throws on fractional values', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;
      scope.persistence.resourceConfiguration.mockResolvedValue(cfg);

      await expect(
        scope.service.updateResourceBillingConfiguration(1, { creditsPerUsage: 1.5 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        scope.service.updateResourceBillingConfiguration(1, {
          creditsPerMinute: 2.2,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('treats a captured meter rate alone as billing being enabled', async () => {
      jest.spyOn(scope.service, 'getResourceBillingConfiguration').mockResolvedValue({
        creditsPerUsage: 0,
        creditsPerMinute: 0,
        creditsPerOperatingMinute: 0,
      } as ResourceBillingConfiguration);
      await expect(
        scope.service.isBillingEnabled(1, undefined, {
          meterRates: [{ meterId: 1, name: 'Heartbeat', creditsPerUnit: 3 }],
        } as ResourceUsage),
      ).resolves.toBe(true);
    });

    it('allows partial update without validating undefined fields', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 1, creditsPerMinute: 2 } as ResourceBillingConfiguration;

      scope.persistence.resourceConfiguration.mockResolvedValue(cfg);
      scope.persistence.saveResourceConfiguration.mockImplementation(
        async (arg) => arg as ResourceBillingConfiguration,
      );

      const result = await scope.service.updateResourceBillingConfiguration(1, {
        creditsPerUsage: 3,
      });
      expect(result.creditsPerUsage).toBe(3);
      expect(result.creditsPerMinute).toBe(2);
    });
  });

  describe('configuration currency', () => {
    it('setConfiguration throws on invalid currency', async () => {
      await expect(scope.service.setConfiguration({ currency: 'USD' as Currency })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('stores the currency through the operation port and returns its configuration', async () => {
      scope.persistence.currency.mockResolvedValue({ value: 'EUR' });
      expect(await scope.service.setConfiguration({ currency: Currency.EUR })).toEqual({
        currency: Currency.EUR,
        minorUnit: 2,
      });
      expect(scope.persistence.setCurrency).toHaveBeenCalledWith(Currency.EUR);
    });

    it('getConfiguration returns defaults when no setting present', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scope.persistence.currency.mockResolvedValue(null as any);
      const result = await scope.service.getConfiguration();
      expect(result).toEqual({ currency: Currency.EUR, minorUnit: 2 });
    });

    it('getConfiguration throws on unsupported currency value from DB', async () => {
      scope.persistence.currency.mockResolvedValue({ value: 'USD' } as Setting);
      await expect(scope.service.getConfiguration()).rejects.toBeInstanceOf(Error);
    });
  });

  describe('BillingService chargeForResourceUsage', () => {
    it('rejects recalculation when a completed transaction already exists for the usage', async () => {
      const usage = { id: 5, resourceId: 1 } as ResourceUsage;
      scope.persistence.completedUsageCharge.mockResolvedValue({
        id: 123,
        resourceUsageId: usage.id,
        status: BillingTransactionStatus.Completed,
      } as BillingTransaction);

      await expect(scope.service.chargeForResourceUsage(usage)).rejects.toThrow(
        'Billing transaction already exists for this resource usage',
      );

      expect(scope.transactionDriver.run).toHaveBeenCalledTimes(1);
      expect(scope.persistence.createTransaction).not.toHaveBeenCalled();
    });

    it('sends email after completing usage transaction', async () => {
      let committed = false;
      const usage: Partial<ResourceUsage> = {
        id: 5,
        resourceId: 1,
        userId: 10,
        usageInMinutes: 10,
        resource: { id: 1, name: 'CNC' } as Resource,
        user: { id: 10, billingFactor: 100 } as User,
      };

      scope.transactionDriver.run.mockImplementation(async (_conflicts, work) => {
        const result = await work({ resolve: () => scope.persistence as never });
        expect(scope.emailService.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
        expect(scope.liveNotificationsService.notifyTransactionUpdate).not.toHaveBeenCalled();
        committed = true;
        return result;
      });
      scope.persistence.chargeForNotification.mockImplementation(async () => {
        expect(committed).toBe(true);
        return {
          id: 123,
          amount: -105,
          status: BillingTransactionStatus.Completed,
          user: { id: 10, email: 'u@example.com' },
          resourceUsage: usage,
          items: [],
        } as BillingTransaction;
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

    it('does not publish an aborted or pending charge', async () => {
      scope.persistence.chargeForNotification.mockResolvedValue(null);

      await scope.service.notifyResourceUsageCharge(123);

      expect(scope.persistence.chargeForNotification).toHaveBeenCalledWith(123);
      expect(scope.liveNotificationsService.notifyTransactionUpdate).not.toHaveBeenCalled();
      expect(scope.emailService.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
    });

    it('validates a tentative start without creating billing records', async () => {
      jest.spyOn(scope.service, 'getResourceBillingConfiguration').mockResolvedValue({
        creditsPerUsage: 10,
        creditsPerMinute: 2,
      } as ResourceBillingConfiguration);
      jest.spyOn(scope.service, 'isBillingEnabled').mockResolvedValue(true);
      jest.spyOn(scope.service, 'getBalance').mockResolvedValue(12);

      await scope.service.validateResourceUsageStart(
        1,
        { sessionDurationCreditsPerMinute: 2 } as ResourceUsage,
        { id: 7 } as User,
      );

      expect(scope.persistence.createTransaction).not.toHaveBeenCalled();
      expect(scope.auditService.recordBillingTransactionAfterCommit).not.toHaveBeenCalled();
      expect(scope.liveNotificationsService.notifyTransactionUpdate).not.toHaveBeenCalled();
    });

    it('does not turn a committed lifecycle into a failure when charge publication fails', async () => {
      scope.persistence.chargeForNotification.mockRejectedValue(new Error('Read unavailable'));

      await expect(scope.service.notifyResourceUsageCharge(123)).resolves.toBeUndefined();

      expect(scope.emailService.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
    });
  });
});
