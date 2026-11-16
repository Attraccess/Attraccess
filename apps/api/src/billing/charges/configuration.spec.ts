import { BillingTransactionStatus } from '@attraccess/application-models';
import { BadRequestException } from '@nestjs/common';
import { billingTransactionAuditEvent } from '../../audit/policies/billing';
import { Currency } from '../dto/set-configuration.dto';
import { InsufficientBalanceError } from '../errors/insufficient-balance.error';
import { ResourceBillingConfigurationNotFoundException } from '../errors/resource-billing-configuration-not-found.error';
import { billableUsage, createBillingServiceFixture } from './fixtures/billing-service.test-fixture';

describe('BillingService configuration and usage start', () => {
  let f: ReturnType<typeof createBillingServiceFixture>;

  beforeEach(() => {
    f = createBillingServiceFixture();
  });

  describe('getResourceBillingConfiguration', () => {
    it('creates a free default configuration when none exists', async () => {
      const result = await f.service.getResourceBillingConfiguration(42);

      expect(f.configurationStore.created).toEqual([42]);
      expect(result).toMatchObject({
        resourceId: 42,
        creditsPerUsage: 0,
        creditsPerMinute: 0,
        creditsPerOperatingMinute: 0,
      });
    });

    it('returns the existing configuration when present', async () => {
      const existing = f.configurationStore.configure(7, { creditsPerUsage: 1, creditsPerMinute: 2 });

      expect(await f.service.getResourceBillingConfiguration(7)).toBe(existing);
      expect(f.configurationStore.created).toEqual([]);
    });

    it('charges both snapped duration rates without changing legacy session-duration charging', async () => {
      f.configurationStore.configure(205, { creditsPerMinute: 99 });
      const usage = billableUsage({
        startTime: new Date('2026-09-20T09:07:54.000Z'),
        endTime: new Date('2026-09-20T09:10:00.000Z'),
        attributedOperatingDurationInMinutes: 1.1,
        sessionDurationCreditsPerMinute: 3,
        operatingDurationCreditsPerMinute: 7,
        creditsPerUsage: null,
      });

      const transaction = await f.service.chargeForResourceUsage(usage, {});

      expect(transaction?.amount).toBe(-23);
      expect(transaction?.items).toContainEqual(
        expect.objectContaining({ name: 'PER_MINUTE', unitPrice: 3, quantity: 3 }),
      );
      expect(transaction?.items).toContainEqual(
        expect.objectContaining({ name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE', unitPrice: 7, quantity: 2 }),
      );
    });
  });

  describe('shared running time', () => {
    const usage = billableUsage({
      id: 31,
      startTime: new Date('2026-09-20T09:00:00.000Z'),
      endTime: new Date('2026-09-20T09:10:00.000Z'),
      attributedOperatingDurationInMinutes: 3.75,
      sessionDurationCreditsPerMinute: 2,
      operatingDurationCreditsPerMinute: 6,
      creditsPerUsage: 5,
    });
    const share = {
      shared: true,
      shareMs: 225_000,
      credits: 23,
      shareCredits: 0,
      segments: [
        {
          startedAt: new Date('2026-09-20T09:00:00.000Z'),
          endedAt: new Date('2026-09-20T09:05:00.000Z'),
          participants: [
            { usageId: 31, rate: 6, startedAt: 1 },
            { usageId: 32, rate: 6, startedAt: 2 },
          ],
          operatingMs: 300_000,
          totalCredits: 30,
          shareCredits: 15,
        },
      ],
    };

    it('keeps the fee and session minutes personal and charges the exact whole-credit share of running time', async () => {
      const transaction = await f.service.chargeForResourceUsage(usage, {}, share as never);

      // 5 per use + 10 minutes at 2 per minute + the 23 credits of running time; no per-minute round-up of the share.
      expect(transaction?.amount).toBe(-(5 + 20 + 23));
      expect(transaction?.items).toContainEqual(expect.objectContaining({ name: 'PER_SESSION', unitPrice: 5 }));
      expect(transaction?.items).toContainEqual(
        expect.objectContaining({ name: 'PER_MINUTE', unitPrice: 2, quantity: 10 }),
      );
      expect(transaction?.items).toContainEqual(
        expect.objectContaining({
          name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE',
          unitPrice: 23,
          quantity: 1,
          durationMs: 225_000,
          allocation: {
            kind: 'operating-time',
            segments: [expect.objectContaining({ participants: 2, totalCredits: 30, shareCredits: 15 })],
          },
        }),
      );
    });

    it('shows no share of running time when the shared session had none', async () => {
      const transaction = await f.service.chargeForResourceUsage(usage, {}, {
        shared: true,
        shareMs: 0,
        credits: 0,
        shareCredits: 0,
        segments: [],
      } as never);

      expect(transaction?.amount).toBe(-(5 + 20));
      expect(transaction?.items).toContainEqual(
        expect.objectContaining({
          name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE',
          durationMs: 0,
          unitPrice: 6,
          quantity: 0,
        }),
      );
    });

    it('bills a session that did not share exactly as before even when a share is passed', async () => {
      const transaction = await f.service.chargeForResourceUsage(usage, {}, { ...share, shared: false } as never);

      // 3.75 operating minutes round up to 4 at 6 credits.
      expect(transaction?.amount).toBe(-(5 + 20 + 24));
    });
  });

  describe('handleResourceUsageStart', () => {
    it('validates the frozen fixed fee after pricing changes during a start flow', async () => {
      const usage = { creditsPerUsage: 5, sessionDurationCreditsPerMinute: 3, operatingDurationCreditsPerMinute: 7 };
      f.configurationStore.configure(205, { creditsPerUsage: 99, creditsPerMinute: 99, creditsPerOperatingMinute: 99 });
      f.ledgerStore.balances.set(25, 8);

      await expect(f.service.validateResourceUsageStart(205, usage, { id: 25 })).resolves.toBeUndefined();

      f.configurationStore.configure(205);
      f.ledgerStore.balances.set(25, 7);
      await expect(f.service.validateResourceUsageStart(205, usage, { id: 25 })).rejects.toBeInstanceOf(
        InsufficientBalanceError,
      );
    });

    it('does not reserve an operating-minute charge that may not be incurred', async () => {
      f.configurationStore.configure(205, { creditsPerUsage: 5, creditsPerMinute: 3, creditsPerOperatingMinute: 7 });
      f.ledgerStore.balances.set(25, 8);
      const usage = { id: 22, sessionDurationCreditsPerMinute: 3, operatingDurationCreditsPerMinute: 7 };

      await expect(f.service.handleResourceUsageStart(205, usage, { id: 25 })).resolves.toBeUndefined();

      expect(f.ledgerStore.transactions).toEqual([
        expect.objectContaining({
          userId: 25,
          resourceUsageId: 22,
          amount: 0,
          status: BillingTransactionStatus.Pending,
        }),
      ]);
    });

    it('audits the pending start transaction inside the caller transaction', async () => {
      const callerTransaction = {};

      await f.service.handleResourceUsageStart(205, { id: 31 }, { id: 32 }, callerTransaction);

      expect(f.ledgerStore.audits).toEqual([
        {
          event: billingTransactionAuditEvent({
            transactionId: f.ledgerStore.transactions[0].id,
            userId: 32,
            amount: 0,
            status: BillingTransactionStatus.Pending,
            source: 'resource-usage',
          }),
          context: callerTransaction,
        },
      ]);
    });

    it('rejects a start the balance cannot cover without writing anything', async () => {
      f.configurationStore.configure(205, { creditsPerUsage: 10, creditsPerMinute: 2 });
      f.ledgerStore.balances.set(25, 11);

      await expect(f.service.handleResourceUsageStart(205, { id: 22 }, { id: 25 })).rejects.toBeInstanceOf(
        InsufficientBalanceError,
      );

      expect(f.ledgerStore.transactions).toHaveLength(0);
      expect(f.audit.record).not.toHaveBeenCalled();
    });

    it('validates a tentative start without creating billing records', async () => {
      f.configurationStore.configure(1, { creditsPerUsage: 10, creditsPerMinute: 2 });
      f.ledgerStore.balances.set(7, 12);

      await f.service.validateResourceUsageStart(1, { sessionDurationCreditsPerMinute: 2 }, { id: 7 });

      expect(f.ledgerStore.transactions).toHaveLength(0);
      expect(f.ledgerStore.audits).toHaveLength(0);
      expect(f.audit.record).not.toHaveBeenCalled();
      expect(f.liveNotifications.notifyTransactionUpdate).not.toHaveBeenCalled();
    });
  });

  describe('isBillingEnabled', () => {
    beforeEach(() => {
      f.configurationStore.configure(1);
    });

    it('is off for a free resource', async () => {
      await expect(f.service.isBillingEnabled(1)).resolves.toBe(false);
    });

    it('treats a captured meter rate alone as billing being enabled', async () => {
      await expect(f.service.isBillingEnabled(1, undefined, { meterRates: [{ creditsPerUnit: 3 }] })).resolves.toBe(
        true,
      );
    });

    it('ignores the stored meters when the usage froze its own meter rates', async () => {
      f.configurationStore.pricedMeterResources.add(1);

      await expect(f.service.isBillingEnabled(1, undefined, { meterRates: [] })).resolves.toBe(false);
      await expect(f.service.isBillingEnabled(1)).resolves.toBe(true);
    });

    it('is on when a flow adds billing items', async () => {
      f.flows.getNodes.mockResolvedValue([{ id: 'node' }]);

      await expect(f.service.isBillingEnabled(1)).resolves.toBe(true);
    });
  });

  describe('updateResourceBillingConfiguration', () => {
    it('throws when the configuration is not found', async () => {
      await expect(
        f.service.updateResourceBillingConfiguration(1, { creditsPerUsage: 1, creditsPerMinute: 1 }),
      ).rejects.toBeInstanceOf(ResourceBillingConfigurationNotFoundException);
    });

    it.each([{ creditsPerMinute: -1 }, { creditsPerUsage: -1 }, { creditsPerOperatingMinute: -1 }])(
      'throws on a negative rate %p and keeps the stored rates',
      async (change) => {
        f.configurationStore.configure(1, { creditsPerUsage: 4 });

        await expect(f.service.updateResourceBillingConfiguration(1, change)).rejects.toBeInstanceOf(
          BadRequestException,
        );

        expect(f.configurationStore.configurations.get(1)?.creditsPerUsage).toBe(4);
        expect(f.events.emit).not.toHaveBeenCalled();
      },
    );

    it('coerces nulls to 0 and saves', async () => {
      f.configurationStore.configure(1, { creditsPerUsage: 5, creditsPerMinute: 6 });

      const result = await f.service.updateResourceBillingConfiguration(1, {
        creditsPerUsage: null,
        creditsPerMinute: null,
      });

      expect(result).toMatchObject({ creditsPerUsage: 0, creditsPerMinute: 0 });
    });

    it('throws on fractional values', async () => {
      f.configurationStore.configure(1);

      await expect(f.service.updateResourceBillingConfiguration(1, { creditsPerUsage: 1.5 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(f.service.updateResourceBillingConfiguration(1, { creditsPerMinute: 2.2 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        f.service.updateResourceBillingConfiguration(1, { creditsPerOperatingMinute: 0.5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows a partial update and announces the change', async () => {
      f.configurationStore.configure(1, { creditsPerUsage: 1, creditsPerMinute: 2, creditsPerOperatingMinute: 3 });

      const result = await f.service.updateResourceBillingConfiguration(1, { creditsPerUsage: 3 });

      expect(result).toMatchObject({ creditsPerUsage: 3, creditsPerMinute: 2, creditsPerOperatingMinute: 3 });
      expect(f.events.emit).toHaveBeenCalledTimes(1);
    });
  });

  describe('configuration currency', () => {
    it('setConfiguration throws on an invalid currency', async () => {
      await expect(f.service.setConfiguration({ currency: 'USD' as Currency })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(f.configurationStore.currency).toBeNull();
    });

    it('setConfiguration stores the currency and returns the configuration', async () => {
      const result = await f.service.setConfiguration({ currency: Currency.EUR });

      expect(f.configurationStore.currency).toBe('EUR');
      expect(result).toEqual({ currency: Currency.EUR, minorUnit: 2 });
    });

    it('getConfiguration returns defaults when no setting is present', async () => {
      expect(await f.service.getConfiguration()).toEqual({ currency: Currency.EUR, minorUnit: 2 });
    });

    it('getConfiguration throws on an unsupported stored currency', async () => {
      f.configurationStore.currency = 'USD';

      await expect(f.service.getConfiguration()).rejects.toThrow('Unsupported currency: USD');
    });
  });

  describe('notifyResourceUsageCharge', () => {
    const receipt = (amount: number, email = 'u@example.com') => ({
      transaction: {
        id: 123,
        userId: 10,
        amount,
        status: BillingTransactionStatus.Completed,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
      },
      recipient: { id: 10, username: 'u', email, locale: 'en', creditBalance: 1000 },
      usage: {
        startTime: new Date('2026-09-20T09:00:00Z'),
        endTime: new Date('2026-09-20T09:10:00Z'),
        billingFactor: null,
        resource: { id: 1, name: 'CNC' },
      },
    });

    it('announces the charge and mails the receipt', async () => {
      f.ledgerStore.receipts.set(123, receipt(-105));

      await f.service.notifyResourceUsageCharge(123);

      expect(f.liveNotifications.notifyTransactionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 123, amount: -105 }),
      );
      expect(f.email.sendResourceUsageBillingSummaryEmail).toHaveBeenCalledTimes(1);
      const [recipient, transaction, usage, minorUnit] = f.email.sendResourceUsageBillingSummaryEmail.mock.calls[0];
      expect(recipient).toMatchObject({ id: 10, email: 'u@example.com' });
      expect(transaction).toMatchObject({ amount: -105 });
      expect(usage).toMatchObject({ resource: { name: 'CNC' } });
      expect(minorUnit).toBe(2);
    });

    it('does not publish an aborted or pending charge', async () => {
      await f.service.notifyResourceUsageCharge(123);

      expect(f.liveNotifications.notifyTransactionUpdate).not.toHaveBeenCalled();
      expect(f.email.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
    });

    it.each([
      ['a free charge', receipt(0)],
      ['an owner without a mail address', receipt(-5, '')],
    ])('announces but does not mail %s', async (_name, source) => {
      f.ledgerStore.receipts.set(123, source);

      await f.service.notifyResourceUsageCharge(123);

      expect(f.liveNotifications.notifyTransactionUpdate).toHaveBeenCalledTimes(1);
      expect(f.email.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
    });

    it('does not turn a committed lifecycle into a failure when charge publication fails', async () => {
      jest.spyOn(f.ledgerStore, 'findUsageReceipt').mockRejectedValue(new Error('Read unavailable'));

      await expect(f.service.notifyResourceUsageCharge(123)).resolves.toBeUndefined();

      expect(f.email.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
    });
  });
});
