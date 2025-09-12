import { Test, TestingModule } from '@nestjs/testing';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { ForbiddenException } from '@nestjs/common';
import { BillingTransaction, User } from '@attraccess/database-entities';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { DeepPartial } from 'typeorm';
import { TransactionsDto } from './dto/transactions.dto';

const baseReq = (userOverrides: DeepPartial<User> = {}) =>
  ({
    user: {
      id: 1,
      systemPermissions: {
        canManageBilling: false,
      },
      ...userOverrides,
    },
  }) as AuthenticatedRequest;

describe('BillingController', () => {
  let controller: BillingController;
  let service: {
    getBalance: jest.Mock;
    getHistory: jest.Mock;
    createManualTransaction: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getBalance: jest.fn(),
      getHistory: jest.fn(),
      createManualTransaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        {
          provide: BillingService,
          useValue: service,
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
      const req = baseReq({ systemPermissions: { canManageBilling: true } });
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
      const req = baseReq({ systemPermissions: { canManageBilling: true } });
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
});
