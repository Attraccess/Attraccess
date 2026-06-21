import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { BillingModule } from './billing.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import {
  BillingTransaction,
  BillingTransactionItem,
  ResourceBillingConfiguration,
  Setting,
  User,
} from '@attraccess/database-entities';
import { SumUpService } from './sumup.service';
import { LiveNotificationsService } from './liveNotificationsService';
import { ResourceFlowsExecutorService } from '../resources/flows/resource-flows-executor.service';
import { ResourceFlowsService } from '../resources/flows/resource-flows.service';
import { EmailService } from '../email/email.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MetricsService } from '../metrics/metrics.service';
import { SseInstrumentation } from '../metrics/instrumentation/sse/sse.helper';
import { Observable } from 'rxjs';
import { LicenseService } from '../license/license.service';

const mockMetricsService = {
  billingTransactionsTotal: { inc: jest.fn() },
  billingTransactionAmount: { observe: jest.fn() },
};

describe('BillingModule', () => {
  describe('metadata', () => {
    it('should declare controller, provider and export BillingService', () => {
      const importsMeta = Reflect.getMetadata('imports', BillingModule) || [];
      const controllersMeta = Reflect.getMetadata('controllers', BillingModule) || [];
      const providersMeta = Reflect.getMetadata('providers', BillingModule) || [];
      const exportsMeta = Reflect.getMetadata('exports', BillingModule) || [];

      expect(controllersMeta).toContain(BillingController);
      expect(providersMeta).toContain(BillingService);
      expect(exportsMeta).toContain(BillingService);

      // Ensure TypeOrmModule.forFeature is registered in imports
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typeOrmFeature = importsMeta.find((entry: any) => entry?.module === TypeOrmModule);
      expect(typeOrmFeature).toBeDefined();
    });
  });

  describe('instantiation with mocked repositories (no real TypeORM)', () => {
    let moduleRef: TestingModule;

    beforeEach(async () => {
      moduleRef = await Test.createTestingModule({
        controllers: [BillingController],
        providers: [
          BillingService,
          { provide: LiveNotificationsService, useValue: { notifyTransactionUpdate: jest.fn() } },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          { provide: SumUpService, useValue: {} },
          { provide: EmailService, useValue: { sendResourceUsageBillingSummaryEmail: jest.fn() } },
          { provide: getRepositoryToken(BillingTransaction), useValue: { findAndCount: jest.fn(), save: jest.fn() } },
          { provide: getRepositoryToken(User), useValue: { findOneBy: jest.fn() } },
          {
            provide: getRepositoryToken(ResourceBillingConfiguration),
            useValue: { save: jest.fn(), findOneBy: jest.fn(), create: jest.fn() },
          },
          {
            provide: getRepositoryToken(Setting),
            useValue: { findOneBy: jest.fn(), insert: jest.fn(), update: jest.fn() },
          },
          {
            provide: getRepositoryToken(BillingTransactionItem),
            useValue: {
              manager: {
                transaction: jest.fn(async (cb: (em: unknown) => Promise<unknown>) => cb({})),
              },
            },
          },
          {
            provide: ResourceFlowsExecutorService,
            useValue: { runFlow: jest.fn().mockResolvedValue([]) },
          },
          {
            provide: ResourceFlowsService,
            useValue: { getNodes: jest.fn().mockResolvedValue([]) },
          },
          {
            provide: MetricsService,
            useValue: mockMetricsService,
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
    });

    it('should resolve BillingService and BillingController', () => {
      expect(moduleRef.get(BillingService)).toBeDefined();
      expect(moduleRef.get(BillingController)).toBeDefined();
    });

    it('should resolve repository tokens', () => {
      expect(moduleRef.get(getRepositoryToken(BillingTransaction))).toBeDefined();
      expect(moduleRef.get(getRepositoryToken(User))).toBeDefined();
    });
  });
});
