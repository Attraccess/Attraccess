import { AUDIT_RECORDER } from '../audit/recorder/audit-event';
import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { BillingModule } from './billing.module';
import { BillingController } from './billing.controller';
import { BillingService } from './charges/billing.service';
import { BillingPersistenceModule } from '../database/adapters/billing/billing-persistence.module';
import { BILLING_CONFIGURATION_STORE } from './ports/billing-configuration.port';
import { BILLING_LEDGER_STORE } from './ports/billing-ledger.port';
import { UNIT_OF_WORK } from '../database/unit-of-work';
import { FakeBillingConfigurationStore, FakeBillingLedgerStore, FakeUnitOfWork } from './testing/billing-store.fakes';
import { SumUpService } from './sumup/sumup.service';
import { LiveNotificationsService } from './live-notifications/live-notifications.service';
import { ResourceFlowsExecutorService } from '../resources/flows/execution/resource-flows-executor.service';
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

      // The persistence ports come from the adapter module; the feature module itself knows no ORM.
      expect(importsMeta).toContain(BillingPersistenceModule);
    });
  });

  describe('instantiation with fake ports (no database)', () => {
    let moduleRef: TestingModule;

    beforeEach(async () => {
      moduleRef = await Test.createTestingModule({
        controllers: [BillingController],
        providers: [
          BillingService,
          { provide: LiveNotificationsService, useValue: { notifyTransactionUpdate: jest.fn() } },
          {
            provide: AUDIT_RECORDER,
            useValue: { record: jest.fn() },
          },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          { provide: SumUpService, useValue: {} },
          { provide: EmailService, useValue: { sendResourceUsageBillingSummaryEmail: jest.fn() } },
          { provide: BILLING_LEDGER_STORE, useValue: new FakeBillingLedgerStore() },
          { provide: BILLING_CONFIGURATION_STORE, useValue: new FakeBillingConfigurationStore() },
          { provide: UNIT_OF_WORK, useValue: new FakeUnitOfWork() },
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
            useValue: { wrap: <T>(_s: string, source: Observable<T>) => source },
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

    it('should resolve the billing ports', () => {
      expect(moduleRef.get(BILLING_LEDGER_STORE)).toBeInstanceOf(FakeBillingLedgerStore);
      expect(moduleRef.get(BILLING_CONFIGURATION_STORE)).toBeInstanceOf(FakeBillingConfigurationStore);
    });
  });
});
