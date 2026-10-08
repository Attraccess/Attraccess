import { registerBillingControllerFixture } from './billing.controller.billing-controller.test-fixture';
import { BillingTransaction } from '@attraccess/database-entities';
import { ForbiddenException } from '@nestjs/common';
import { Currency, SetBillingConfigurationDto } from './dto/set-configuration.dto';
import { BillingConfigurationDto } from './dto/configuration.dto';
import { TransactionsDto } from './dto/transactions.dto';
import { SetSumUpApiKeyDto } from './dto/sumup/set-sumup-apiKey.dto';
import { Subject } from 'rxjs';
import { SumupTransactionCallbackDto } from './dto/sumup/sumup-transaction-callback.dto';
import { UpdateResourceBillingConfigurationDto } from './dto/update-resource-billing-configuration.dto';

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

  describe('getBillingTransactions', () => {
    it('allows self read', async () => {
      const data = { data: [], total: 0, page: 1, limit: 10 };
      fixture.service.getHistory.mockResolvedValue(data);
      const res = await fixture.controller.getBillingTransactions(1, { page: 1, limit: 10 }, fixture.baseReq());
      expect(res).toBe(data);
      expect(fixture.service.getHistory).toHaveBeenCalledWith(1, { page: 1, limit: 10 });
    });

    it('forbids other user when no permission', async () => {
      await expect(
        fixture.controller.getBillingTransactions(2, { page: 1, limit: 10 }, fixture.baseReq()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows when has canManageBilling', async () => {
      const data = { data: [{ id: 1 }], total: 1, page: 1, limit: 10 } as TransactionsDto;
      fixture.service.getHistory.mockResolvedValue(data);
      const req = fixture.baseReq({ effectivePermissions: new Set(['billing.manage']) });
      const res = await fixture.controller.getBillingTransactions(2, { page: 1, limit: 10 }, req);
      expect(res).toBe(data);
    });
  });

  describe('createManualTransaction', () => {
    it('delegates to service with initiator id and amount', async () => {
      const tx = { id: 123 } as BillingTransaction;
      fixture.service.createManualTransaction.mockResolvedValue(tx);
      const req = fixture.baseReq();
      const res = await fixture.controller.createManualTransaction(5, req, { amount: 25 });
      expect(fixture.service.createManualTransaction).toHaveBeenCalledWith(5, 1, 25);
      expect(res).toBe(tx);
    });
  });

  describe('getResourceBillingConfiguration', () => {
    it('delegates to service and returns configuration', async () => {
      const cfg = { pricing: { perHour: 10 } };
      fixture.service.getResourceBillingConfiguration.mockResolvedValue(cfg);
      const res = await fixture.controller.getResourceBillingConfiguration(42);
      expect(fixture.service.getResourceBillingConfiguration).toHaveBeenCalledWith(42);
      expect(res).toEqual({ configuration: cfg, additionalItems: [], isBillingEnabled: false });
    });
  });

  describe('updateResourceBillingConfiguration', () => {
    it('delegates to service and returns updated configuration', async () => {
      const body = { pricing: { perHour: 12 } } as UpdateResourceBillingConfigurationDto;
      const updated = { pricing: { perHour: 12 } };
      fixture.service.updateResourceBillingConfiguration.mockResolvedValue(updated);
      const res = await fixture.controller.updateResourceBillingConfiguration(7, body);
      expect(fixture.service.updateResourceBillingConfiguration).toHaveBeenCalledWith(7, body);
      expect(res).toBe(updated);
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
      const tx = { id: 999 } as BillingTransaction;
      fixture.sumUp.topUpWithReader.mockResolvedValue(tx);
      const req = fixture.baseReq({ id: 55 });
      const res = await fixture.controller.topUpWithSumUpReader({ readerId: 'r-22', amount: 2500 }, req);
      expect(fixture.sumUp.topUpWithReader).toHaveBeenCalledWith(55, 'r-22', 2500);
      expect(res).toBe(tx);
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
      const rxSubject = new Subject<{ data: BillingTransaction }>();
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
