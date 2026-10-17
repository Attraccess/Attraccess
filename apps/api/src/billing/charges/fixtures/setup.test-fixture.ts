import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingService } from '../billing.service';
import {
  BillingTransaction,
  ResourceBillingConfiguration,
  User,
  Setting,
  BillingTransactionItem,
} from '@attraccess/database-entities';
import { LiveNotificationsService } from '../../live-notifications/live-notifications.service';
import { ResourceFlowsExecutorService } from '../../../resources/flows/execution/resource-flows-executor.service';
import { ResourceFlowsService } from '../../../resources/flows/resource-flows.service';
import { EmailService } from '../../../email/email.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MetricsService } from '../../../metrics/metrics.service';
import { AuditService } from '../../../audit/audit.service';
import { BillingServiceTestScope } from '../billing.service.spec';
export async function resetTestFixture(scope: BillingServiceTestScope) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      BillingService,
      { provide: LiveNotificationsService, useValue: { notifyTransactionUpdate: jest.fn() } },
      { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      // Provide BillingTransactionItem repo with a manager.transaction for internal use
      {
        provide: getRepositoryToken(BillingTransactionItem),
        useValue: {
          manager: {
            transaction: jest.fn(async (cb: (em: unknown) => Promise<unknown>) =>
              cb({
                findOneBy: jest.fn(),
                getRepository: jest.fn(() => ({ findOneBy: jest.fn(), create: jest.fn(), save: jest.fn() })),
                save: jest.fn(async (_e: string, data: unknown) => data),
              }),
            ),
          },
        },
      },
      {
        provide: getRepositoryToken(BillingTransaction),
        useValue: {
          findAndCount: jest.fn(),
          findOne: jest.fn(),
          findOneBy: jest.fn(),
          save: jest.fn(),
        },
      },
      {
        provide: getRepositoryToken(User),
        useValue: {
          findOneBy: jest.fn(),
        },
      },
      {
        provide: getRepositoryToken(ResourceBillingConfiguration),
        useValue: {
          manager: { count: jest.fn().mockResolvedValue(0) },
          findOneBy: jest.fn(),
          create: jest.fn(),
          save: jest.fn(),
        },
      },
      {
        provide: getRepositoryToken(Setting),
        useValue: {
          findOneBy: jest.fn(),
          insert: jest.fn(),
          update: jest.fn(),
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
        provide: EmailService,
        useValue: { sendBillingTransactionEmail: jest.fn(), sendResourceUsageBillingSummaryEmail: jest.fn() },
      },
      {
        provide: MetricsService,
        useValue: scope.mockMetricsService,
      },
      {
        provide: AuditService,
        useValue: { recordBillingTransaction: jest.fn(), recordBillingTransactionAfterCommit: jest.fn() },
      },
    ],
  }).compile();

  scope.service = module.get(BillingService);
  scope.billingTransactionRepository = module.get(getRepositoryToken(BillingTransaction)) as jest.Mocked<
    Repository<BillingTransaction>
  >;
  scope.userRepository = module.get(getRepositoryToken(User)) as jest.Mocked<Repository<User>>;
  scope.settingRepository = module.get(getRepositoryToken(Setting)) as jest.Mocked<Repository<Setting>>;
  scope.resourceBillingConfigurationRepository = module.get(
    getRepositoryToken(ResourceBillingConfiguration),
  ) as jest.Mocked<Repository<ResourceBillingConfiguration>>;
  scope.liveNotificationsService = module.get(LiveNotificationsService);
  scope.emailService = module.get(EmailService);
  scope.billingTransactionItemRepository = module.get(getRepositoryToken(BillingTransactionItem)) as jest.Mocked<
    Repository<BillingTransactionItem>
  >;
  scope.auditService = module.get(AuditService);
}
