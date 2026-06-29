import { Test, TestingModule } from '@nestjs/testing';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { ForbiddenException } from '@nestjs/common';
import { BillingTransaction, User } from '@attraccess/database-entities';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { DeepPartial } from 'typeorm';
import { TransactionsDto } from './dto/transactions.dto';
import { SumUpService } from './sumup.service';
import { LiveNotificationsService } from './liveNotificationsService';
import { UpdateResourceBillingConfigurationDto } from './dto/update-resource-billing-configuration.dto';
import { SetSumUpApiKeyDto } from './dto/sumup/set-sumup-apiKey.dto';
import { Currency, SetBillingConfigurationDto } from './dto/set-configuration.dto';
import { BillingConfigurationDto } from './dto/configuration.dto';
import { SumupTransactionCallbackDto } from './dto/sumup/sumup-transaction-callback.dto';
import { ResourceFlowsService } from '../resources/flows/resource-flows.service';
import { SseInstrumentation } from '../metrics/instrumentation/sse/sse.helper';
import { Observable, Subject } from 'rxjs';
import { LicenseService } from '../license/license.service';

const baseReq = (userOverrides: DeepPartial<User> = {}) =>
  ({
    user: {
      id: 1,
      ...userOverrides,
    },
  }) as AuthenticatedRequest;

describe('BillingController', () => {
  let controller: BillingController;
  let service: {
    getBalance: jest.Mock;
    getHistory: jest.Mock;
    createManualTransaction: jest.Mock;
    getResourceBillingConfiguration: jest.Mock;
    updateResourceBillingConfiguration: jest.Mock;
    setConfiguration: jest.Mock;
    getConfiguration: jest.Mock;
    isBillingEnabled?: jest.Mock;
  };
  let sumUp: {
    setApiKey: jest.Mock;
    getIsEnabled: jest.Mock;
    getReaders: jest.Mock;
    pairReader: jest.Mock;
    removeReader: jest.Mock;
    topUpWithReader: jest.Mock;
    handleTransactionCallback: jest.Mock;
  };
  let live: {
    getTransactionSubject: jest.Mock;
    deleteSubjectIfUnobserved: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getBalance: jest.fn(),
      getHistory: jest.fn(),
      createManualTransaction: jest.fn(),
      getResourceBillingConfiguration: jest.fn(),
      updateResourceBillingConfiguration: jest.fn(),
      setConfiguration: jest.fn(),
      getConfiguration: jest.fn(),
      isBillingEnabled: jest.fn().mockResolvedValue(false),
    };
    sumUp = {
      setApiKey: jest.fn(),
      getIsEnabled: jest.fn(),
      getReaders: jest.fn(),
      pairReader: jest.fn(),
      removeReader: jest.fn(),
      topUpWithReader: jest.fn(),
      handleTransactionCallback: jest.fn(),
    };
    live = {
      getTransactionSubject: jest.fn(),
      deleteSubjectIfUnobserved: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        {
          provide: BillingService,
          useValue: service,
        },
        {
          provide: SumUpService,
          useValue: sumUp,
        },
        {
          provide: LiveNotificationsService,
          useValue: live,
        },
        {
          provide: ResourceFlowsService,
          useValue: { getNodes: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: SseInstrumentation,
          useValue: { wrap: <T,>(_s: string, source: Observable<T>) => source },
        },
        {
          provide: LicenseService,
          useValue: { verifyLicense: jest.fn().mockResolvedValue({ valid: true, modules: [] }) },
        },
      ],
    }).compile();

    controller = module.get(BillingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getBillingBalance', () => {
    it('allows self read', async () => {
      service.getBalance.mockResolvedValue(50);
      const res = await controller.getBillingBalance(1, baseReq());
      expect(res).toEqual({ value: 50 });
      expect(service.getBalance).toHaveBeenCalledWith(1);
    });

    it('forbids other user when no permission', async () => {
      await expect(controller.getBillingBalance(2, baseReq())).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows when has canManageBilling', async () => {
      service.getBalance.mockResolvedValue(12);
      const req = baseReq({ effectivePermissions: new Set(['billing.manage']) });
      const res = await controller.getBillingBalance(2, req);
      expect(res).toEqual({ value: 12 });
    });
  });

  describe('getBillingTransactions', () => {
    it('allows self read', async () => {
      const data = { data: [], total: 0, page: 1, limit: 10 };
      service.getHistory.mockResolvedValue(data);
      const res = await controller.getBillingTransactions(1, { page: 1, limit: 10 }, baseReq());
      expect(res).toBe(data);
      expect(service.getHistory).toHaveBeenCalledWith(1, { page: 1, limit: 10 });
    });

    it('forbids other user when no permission', async () => {
      await expect(controller.getBillingTransactions(2, { page: 1, limit: 10 }, baseReq())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('allows when has canManageBilling', async () => {
      const data = { data: [{ id: 1 }], total: 1, page: 1, limit: 10 } as TransactionsDto;
      service.getHistory.mockResolvedValue(data);
      const req = baseReq({ effectivePermissions: new Set(['billing.manage']) });
      const res = await controller.getBillingTransactions(2, { page: 1, limit: 10 }, req);
      expect(res).toBe(data);
    });
  });

  describe('createManualTransaction', () => {
    it('delegates to service with initiator id and amount', async () => {
      const tx = { id: 123 } as BillingTransaction;
      service.createManualTransaction.mockResolvedValue(tx);
      const req = baseReq();
      const res = await controller.createManualTransaction(5, req, { amount: 25 });
      expect(service.createManualTransaction).toHaveBeenCalledWith(5, 1, 25);
      expect(res).toBe(tx);
    });
  });

  describe('getResourceBillingConfiguration', () => {
    it('delegates to service and returns configuration', async () => {
      const cfg = { pricing: { perHour: 10 } };
      service.getResourceBillingConfiguration.mockResolvedValue(cfg);
      const res = await controller.getResourceBillingConfiguration(42);
      expect(service.getResourceBillingConfiguration).toHaveBeenCalledWith(42);
      expect(res).toEqual({ configuration: cfg, additionalItems: [], isBillingEnabled: false });
    });
  });

  describe('updateResourceBillingConfiguration', () => {
    it('delegates to service and returns updated configuration', async () => {
      const body = { pricing: { perHour: 12 } } as UpdateResourceBillingConfigurationDto;
      const updated = { pricing: { perHour: 12 } };
      service.updateResourceBillingConfiguration.mockResolvedValue(updated);
      const res = await controller.updateResourceBillingConfiguration(7, body);
      expect(service.updateResourceBillingConfiguration).toHaveBeenCalledWith(7, body);
      expect(res).toBe(updated);
    });
  });

  describe('setSumUpApiKey', () => {
    it('sets api key and returns OK', async () => {
      const res = await controller.setSumUpApiKey({ apiKey: 'abc' } as SetSumUpApiKeyDto);
      expect(sumUp.setApiKey).toHaveBeenCalledWith('abc');
      expect(res).toBe('OK');
    });
  });

  describe('setBillingConfiguration', () => {
    it('delegates to service and returns configuration', async () => {
      const body = { currency: Currency.EUR } as SetBillingConfigurationDto;
      const cfg = { currency: Currency.EUR, minorUnit: 2 } as BillingConfigurationDto;
      service.setConfiguration.mockResolvedValue(cfg);
      const res = await controller.setBillingConfiguration(body);
      expect(service.setConfiguration).toHaveBeenCalledWith(body);
      expect(res).toBe(cfg);
    });
  });

  describe('getBillingConfiguration', () => {
    it('returns current configuration', async () => {
      const cfg = { currency: Currency.EUR, minorUnit: 2 } as BillingConfigurationDto;
      service.getConfiguration.mockResolvedValue(cfg);
      const res = await controller.getBillingConfiguration();
      expect(service.getConfiguration).toHaveBeenCalled();
      expect(res).toBe(cfg);
    });
  });

  describe('getSumUpConfiguration', () => {
    it('returns enabled flag from sumUpService', async () => {
      sumUp.getIsEnabled.mockResolvedValue(true);
      const res = await controller.getSumUpConfiguration();
      expect(sumUp.getIsEnabled).toHaveBeenCalled();
      expect(res).toEqual({ enabled: true });
    });
  });

  describe('getSumUpReaders', () => {
    it('returns readers from sumUpService', async () => {
      const readers = [{ id: 'r1' }];
      sumUp.getReaders.mockResolvedValue(readers);
      const res = await controller.getSumUpReaders();
      expect(sumUp.getReaders).toHaveBeenCalled();
      expect(res).toBe(readers);
    });
  });

  describe('pairSumUpReader', () => {
    it('delegates to sumUpService and returns reader', async () => {
      const reader = { id: 'x' };
      sumUp.pairReader.mockResolvedValue(reader);
      const res = await controller.pairSumUpReader({ pairingCode: '1234', name: 'Front Desk' });
      expect(sumUp.pairReader).toHaveBeenCalledWith('1234', 'Front Desk');
      expect(res).toBe(reader);
    });
  });

  describe('removeSumUpReader', () => {
    it('delegates to sumUpService', async () => {
      sumUp.removeReader.mockResolvedValue(undefined);
      await controller.removeSumUpReader('reader-1');
      expect(sumUp.removeReader).toHaveBeenCalledWith('reader-1');
    });
  });

  describe('topUpWithSumUpReader', () => {
    it('uses request.user.id and delegates to sumUpService', async () => {
      const tx = { id: 999 } as BillingTransaction;
      sumUp.topUpWithReader.mockResolvedValue(tx);
      const req = baseReq({ id: 55 });
      const res = await controller.topUpWithSumUpReader({ readerId: 'r-22', amount: 2500 }, req);
      expect(sumUp.topUpWithReader).toHaveBeenCalledWith(55, 'r-22', 2500);
      expect(res).toBe(tx);
    });
  });

  describe('sumUpTopUpCallback', () => {
    it('delegates to sumUpService and returns OK message', async () => {
      const data = { transaction_id: 't1' };
      sumUp.handleTransactionCallback.mockResolvedValue(undefined);
      const res = await controller.sumUpTopUpCallback(data as unknown as SumupTransactionCallbackDto);
      expect(sumUp.handleTransactionCallback).toHaveBeenCalledWith(data);
      expect(res).toEqual({ message: 'OK' });
    });
  });

  describe('streamEvents', () => {
    it('returns observable from liveNotificationsService subject', async () => {
      const rxSubject = new Subject<{ data: BillingTransaction }>();
      const subject = { asObservable: jest.fn().mockReturnValue(rxSubject.asObservable()) };
      live.getTransactionSubject.mockReturnValue(subject);
      const req = baseReq({ id: 77 });
      const res = await controller.streamEvents(req);
      expect(live.getTransactionSubject).toHaveBeenCalledWith(77);
      expect(subject.asObservable).toHaveBeenCalled();
      expect(res).toBeDefined();
    });
  });
});
