import { registerBillingControllerFixture } from './billing.controller.test-fixture';
import { BillingTransactionRecord, BillingTransactionStatus } from '@attraccess/application-models';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Currency, SetBillingConfigurationDto } from './dto/set-configuration.dto';
import { BillingConfigurationDto } from './dto/configuration.dto';
import { SetSumUpApiKeyDto } from './dto/sumup/set-sumup-apiKey.dto';
import { Subject } from 'rxjs';
import { SumupTransactionCallbackDto } from './dto/sumup/sumup-transaction-callback.dto';
import { UpdateResourceBillingConfigurationDto } from './dto/update-resource-billing-configuration.dto';

const CREATED = new Date('2026-09-20T09:00:00.000Z');

const record = (overrides: Partial<BillingTransactionRecord> = {}): BillingTransactionRecord => ({
  id: 1,
  userId: 5,
  createdAt: CREATED,
  updatedAt: CREATED,
  amount: 25,
  status: BillingTransactionStatus.Completed,
  ...overrides,
});

/** What a client receives: the response after JSON serialization. */
const configuration = {
  id: 1,
  createdAt: CREATED,
  updatedAt: CREATED,
  resourceId: 42,
  creditsPerUsage: 1,
  creditsPerMinute: 2,
  creditsPerOperatingMinute: 3,
};

const json = (value: unknown) => JSON.parse(JSON.stringify(value));

describe('BillingController', () => {
  const fixture = registerBillingControllerFixture();

  it('should be defined', () => {
    expect(fixture.controller).toBeDefined();
  });

  describe('getBillingBalance', () => {
    it('allows self read', async () => {
      fixture.service.getBalance.mockResolvedValue(50);
      const res = await fixture.controller.getBillingBalance(1, fixture.baseReq());
      expect(res).toEqual({ value: 50 });
      expect(fixture.service.getBalance).toHaveBeenCalledWith(1);
    });

    it('forbids other user when no permission', async () => {
      await expect(fixture.controller.getBillingBalance(2, fixture.baseReq())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('allows when has canManageBilling', async () => {
      fixture.service.getBalance.mockResolvedValue(12);
      const req = fixture.baseReq({ effectivePermissions: new Set(['billing.manage']) });
      const res = await fixture.controller.getBillingBalance(2, req);
      expect(res).toEqual({ value: 12 });
    });
  });

  describe('getBillingTransaction', () => {
    it('always scopes transaction details to the authenticated user', async () => {
      fixture.service.getTransaction.mockResolvedValue(null);

      const result = await fixture.controller.getBillingTransaction(
        123,
        fixture.baseReq({ id: 2, effectivePermissions: new Set(['billing.manage']) }),
      );

      expect(fixture.service.getTransaction).toHaveBeenCalledWith(123, 2);
      expect(result).toBeNull();
    });
  });

  it('scopes the usage-to-billing lookup to the requester, including billing managers', async () => {
    fixture.service.getTransactionIdForUsage.mockResolvedValue(null);
    expect(
      await fixture.controller.getUsageBillingTransaction(
        8,
        fixture.baseReq({ id: 2, effectivePermissions: new Set(['billing.manage']) }),
      ),
    ).toEqual({ transactionId: null });
    expect(fixture.service.getTransactionIdForUsage).toHaveBeenCalledWith(8, 2);
  });

  describe('getRunningPartBilling', () => {
    const figures = { flatCredits: 0, roundingStartTime: new Date('2026-11-28T10:00:00Z'), priorCredits: 1400 };

    it.each([
      ['the owner', { id: 1 }],
      ['a billing manager', { id: 2, effectivePermissions: new Set(['billing.manage']) }],
      ['a resource manager', { id: 2, effectivePermissions: new Set(['resources.update']) }],
    ])('tells %s the figures without the owner', async (_name, user) => {
      fixture.service.getRunningPartBilling.mockResolvedValue({ userId: 1, ...figures });

      await expect(fixture.controller.getRunningPartBilling(8, fixture.baseReq(user))).resolves.toStrictEqual(figures);
      expect(fixture.service.getRunningPartBilling).toHaveBeenCalledWith(8);
    });

    it("answers somebody else's running session exactly like one that does not run", async () => {
      fixture.service.getRunningPartBilling.mockResolvedValue({ userId: 1, ...figures });
      const othersSession = await fixture.controller
        .getRunningPartBilling(8, fixture.baseReq({ id: 2 }))
        .catch((error: unknown) => error);
      fixture.service.getRunningPartBilling.mockResolvedValue(null);
      const missing = await fixture.controller
        .getRunningPartBilling(8, fixture.baseReq({ id: 2 }))
        .catch((error: unknown) => error);

      expect(othersSession).toBeInstanceOf(NotFoundException);
      expect(missing).toBeInstanceOf(NotFoundException);
      expect((othersSession as NotFoundException).getResponse()).toEqual((missing as NotFoundException).getResponse());
    });

    it('does not find a usage that does not run', async () => {
      fixture.service.getRunningPartBilling.mockResolvedValue(null);

      await expect(fixture.controller.getRunningPartBilling(8, fixture.baseReq())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getBillingTransactions', () => {
    it('allows self read', async () => {
      const data = { data: [], total: 0, page: 1, limit: 10 };
      fixture.service.getHistory.mockResolvedValue(data);
      const res = await fixture.controller.getBillingTransactions(1, { page: 1, limit: 10 }, fixture.baseReq());
      expect(res).toEqual(data);
      expect(fixture.service.getHistory).toHaveBeenCalledWith(1, { page: 1, limit: 10 });
    });

    it('forbids other user when no permission', async () => {
      await expect(
        fixture.controller.getBillingTransactions(2, { page: 1, limit: 10 }, fixture.baseReq()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows when has canManageBilling', async () => {
      const data = { data: [record({ id: 1, userId: 2 })], total: 1, page: 1, limit: 10 };
      fixture.service.getHistory.mockResolvedValue(data);
      const req = fixture.baseReq({ effectivePermissions: new Set(['billing.manage']) });
      const res = await fixture.controller.getBillingTransactions(2, { page: 1, limit: 10 }, req);
      expect(json(res)).toEqual(json(data));
    });

    it('maps every transaction with its items, initiator, usage and refunded transaction', async () => {
      const initiator = { id: 9, username: 'ada' };
      const resourceUsage = { id: 3, resource: { id: 4, name: 'CNC' } };
      const item = {
        id: 1,
        billingTransactionId: 1,
        name: 'PER_MINUTE',
        description: null,
        externalReference: null,
        unitPrice: 2,
        quantity: 3,
        durationMs: 180_000,
        meterQuantity: null,
        meterCreditsPerUnit: null,
        allocation: null,
      };
      const detail = {
        ...record({ amount: -6, initiatorId: 9, resourceUsageId: 3, refundOfId: 2, items: [item] }),
        initiator,
        resourceUsage,
        refundOf: record({ id: 2 }),
      };
      fixture.service.getHistory.mockResolvedValue({ data: [detail], total: 1, page: 1, limit: 10 });

      const res = await fixture.controller.getBillingTransactions(
        5,
        { page: 1, limit: 10 },
        fixture.baseReq({ id: 5 }),
      );

      expect(json(res)).toEqual({
        data: [
          {
            id: 1,
            userId: 5,
            createdAt: CREATED.toISOString(),
            updatedAt: CREATED.toISOString(),
            amount: -6,
            initiatorId: 9,
            resourceUsageId: 3,
            refundOfId: 2,
            status: 'completed',
            items: [item],
            initiator,
            resourceUsage,
            refundOf: {
              id: 2,
              userId: 5,
              createdAt: CREATED.toISOString(),
              updatedAt: CREATED.toISOString(),
              amount: 25,
              status: 'completed',
            },
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
      });
    });

    it('does not carry fields a record gained that the response never had', async () => {
      const leaky = { ...record(), passwordHash: 'secret', internal: true };
      fixture.service.getHistory.mockResolvedValue({ data: [leaky], total: 1, page: 1, limit: 10 });

      const res = await fixture.controller.getBillingTransactions(
        5,
        { page: 1, limit: 10 },
        fixture.baseReq({ id: 5 }),
      );

      expect(json(res).data[0]).not.toHaveProperty('passwordHash');
      expect(json(res).data[0]).not.toHaveProperty('internal');
    });
  });

  describe('createManualTransaction', () => {
    it('delegates to service with initiator id and amount', async () => {
      const tx = record({ id: 123, userId: 5, initiatorId: 1 });
      fixture.service.createManualTransaction.mockResolvedValue(tx);
      const req = fixture.baseReq();
      const res = await fixture.controller.createManualTransaction(5, req, { amount: 25 });
      expect(fixture.service.createManualTransaction).toHaveBeenCalledWith(5, 1, 25);
      expect(json(res)).toEqual(json(tx));
    });
  });

  describe('getResourceBillingConfiguration', () => {
    it('delegates to service and returns configuration', async () => {
      fixture.service.getResourceBillingConfiguration.mockResolvedValue(configuration);
      const res = await fixture.controller.getResourceBillingConfiguration(42);
      expect(fixture.service.getResourceBillingConfiguration).toHaveBeenCalledWith(42);
      expect(json(res)).toEqual({ configuration: json(configuration), additionalItems: [], isBillingEnabled: false });
    });
  });

  describe('updateResourceBillingConfiguration', () => {
    it('delegates to service and returns updated configuration', async () => {
      const body = { creditsPerUsage: 12 } as UpdateResourceBillingConfigurationDto;
      fixture.service.updateResourceBillingConfiguration.mockResolvedValue({ ...configuration, creditsPerUsage: 12 });
      const res = await fixture.controller.updateResourceBillingConfiguration(7, body);
      expect(fixture.service.updateResourceBillingConfiguration).toHaveBeenCalledWith(7, body);
      expect(json(res)).toEqual({ ...json(configuration), creditsPerUsage: 12 });
    });
  });

  describe('setSumUpApiKey', () => {
    it('sets api key and returns OK', async () => {
      const res = await fixture.controller.setSumUpApiKey({ apiKey: 'abc' } as SetSumUpApiKeyDto);
      expect(fixture.sumUp.setApiKey).toHaveBeenCalledWith('abc');
      expect(res).toBe('OK');
    });
  });

  describe('setBillingConfiguration', () => {
    it('delegates to service and returns configuration', async () => {
      const body = { currency: Currency.EUR } as SetBillingConfigurationDto;
      const cfg = { currency: Currency.EUR, minorUnit: 2 } as BillingConfigurationDto;
      fixture.service.setConfiguration.mockResolvedValue(cfg);
      const res = await fixture.controller.setBillingConfiguration(body);
      expect(fixture.service.setConfiguration).toHaveBeenCalledWith(body);
      expect(res).toBe(cfg);
    });
  });

  describe('getBillingConfiguration', () => {
    it('returns current configuration', async () => {
      const cfg = { currency: Currency.EUR, minorUnit: 2 } as BillingConfigurationDto;
      fixture.service.getConfiguration.mockResolvedValue(cfg);
      const res = await fixture.controller.getBillingConfiguration();
      expect(fixture.service.getConfiguration).toHaveBeenCalled();
      expect(res).toBe(cfg);
    });
  });

  describe('getSumUpConfiguration', () => {
    it('returns enabled flag from sumUpService', async () => {
      fixture.sumUp.getIsEnabled.mockResolvedValue(true);
      const res = await fixture.controller.getSumUpConfiguration();
      expect(fixture.sumUp.getIsEnabled).toHaveBeenCalled();
      expect(res).toEqual({ enabled: true });
    });
  });

  describe('getSumUpReaders', () => {
    it('returns readers from sumUpService', async () => {
      const readers = [{ id: 'r1' }];
      fixture.sumUp.getReaders.mockResolvedValue(readers);
      const res = await fixture.controller.getSumUpReaders();
      expect(fixture.sumUp.getReaders).toHaveBeenCalled();
      expect(res).toBe(readers);
    });
  });

  describe('pairSumUpReader', () => {
    it('delegates to sumUpService and returns reader', async () => {
      const reader = { id: 'x' };
      fixture.sumUp.pairReader.mockResolvedValue(reader);
      const res = await fixture.controller.pairSumUpReader({ pairingCode: '1234', name: 'Front Desk' });
      expect(fixture.sumUp.pairReader).toHaveBeenCalledWith('1234', 'Front Desk');
      expect(res).toBe(reader);
    });
  });

  describe('removeSumUpReader', () => {
    it('delegates to sumUpService', async () => {
      fixture.sumUp.removeReader.mockResolvedValue(undefined);
      await fixture.controller.removeSumUpReader('reader-1');
      expect(fixture.sumUp.removeReader).toHaveBeenCalledWith('reader-1');
    });
  });

  describe('topUpWithSumUpReader', () => {
    it('uses request.user.id and delegates to sumUpService', async () => {
      const tx = record({ id: 999, userId: 55, status: BillingTransactionStatus.Pending });
      fixture.sumUp.topUpWithReader.mockResolvedValue(tx);
      const req = fixture.baseReq({ id: 55 });
      const res = await fixture.controller.topUpWithSumUpReader({ readerId: 'r-22', amount: 2500 }, req);
      expect(fixture.sumUp.topUpWithReader).toHaveBeenCalledWith(55, 'r-22', 2500);
      expect(json(res)).toEqual(json(tx));
    });
  });

  describe('sumUpTopUpCallback', () => {
    it('delegates to sumUpService and returns OK message', async () => {
      const data = { transaction_id: 't1' };
      fixture.sumUp.handleTransactionCallback.mockResolvedValue(undefined);
      const res = await fixture.controller.sumUpTopUpCallback(data as unknown as SumupTransactionCallbackDto);
      expect(fixture.sumUp.handleTransactionCallback).toHaveBeenCalledWith(data);
      expect(res).toEqual({ message: 'OK' });
    });
  });

  describe('streamEvents', () => {
    it('returns observable from liveNotificationsService subject', async () => {
      const rxSubject = new Subject<{ data: BillingTransactionRecord }>();
      const subject = { asObservable: jest.fn().mockReturnValue(rxSubject.asObservable()) };
      fixture.live.getTransactionSubject.mockReturnValue(subject);
      const req = fixture.baseReq({ id: 77 });
      const res = await fixture.controller.streamEvents(req);
      expect(fixture.live.getTransactionSubject).toHaveBeenCalledWith(77);
      expect(subject.asObservable).toHaveBeenCalled();
      expect(res).toBeDefined();
    });
  });
});
