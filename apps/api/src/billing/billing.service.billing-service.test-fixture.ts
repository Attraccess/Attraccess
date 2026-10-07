import {
  BillingTransaction,
  BillingTransactionItem,
  ResourceBillingConfiguration,
  Setting,
  User,
} from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { MetricsService } from '../metrics/metrics.service';
import { ResourceFlowsExecutorService } from '../resources/flows/resource-flows-executor.service';
import { ResourceFlowsService } from '../resources/flows/resource-flows.service';
import { BillingService } from './billing.service';
import { LiveNotificationsService } from './liveNotificationsService';

const mockMetricsService = {
  billingTransactionsTotal: { inc: jest.fn() },
  billingTransactionAmount: { observe: jest.fn() },
};
export function registerBillingServiceFixture() {
  let service: BillingService;

  let billingTransactionRepository: jest.Mocked<Repository<BillingTransaction>>;

  let userRepository: jest.Mocked<Repository<User>>;

  let settingRepository: jest.Mocked<Repository<Setting>>;

  let resourceBillingConfigurationRepository: jest.Mocked<Repository<ResourceBillingConfiguration>>;

  let liveNotificationsService: { notifyTransactionUpdate: jest.Mock };

  let emailService: jest.Mocked<EmailService>;

  let billingTransactionItemRepository: jest.Mocked<Repository<BillingTransactionItem>>;

  let auditService: { recordBillingTransaction: jest.Mock; recordBillingTransactionAfterCommit: jest.Mock };

  beforeEach(async () => {
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
          useValue: mockMetricsService,
        },
        {
          provide: AuditService,
          useValue: { recordBillingTransaction: jest.fn(), recordBillingTransactionAfterCommit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(BillingService);
    billingTransactionRepository = module.get(getRepositoryToken(BillingTransaction)) as jest.Mocked<
      Repository<BillingTransaction>
    >;
    userRepository = module.get(getRepositoryToken(User)) as jest.Mocked<Repository<User>>;
    settingRepository = module.get(getRepositoryToken(Setting)) as jest.Mocked<Repository<Setting>>;
    resourceBillingConfigurationRepository = module.get(
      getRepositoryToken(ResourceBillingConfiguration),
    ) as jest.Mocked<Repository<ResourceBillingConfiguration>>;
    liveNotificationsService = module.get(LiveNotificationsService);
    emailService = module.get(EmailService);
    billingTransactionItemRepository = module.get(getRepositoryToken(BillingTransactionItem)) as jest.Mocked<
      Repository<BillingTransactionItem>
    >;
    auditService = module.get(AuditService);
  });
  return {
    get service() {
      return service;
    },
    get billingTransactionRepository() {
      return billingTransactionRepository;
    },
    get userRepository() {
      return userRepository;
    },
    get settingRepository() {
      return settingRepository;
    },
    get resourceBillingConfigurationRepository() {
      return resourceBillingConfigurationRepository;
    },
    get liveNotificationsService() {
      return liveNotificationsService;
    },
    get emailService() {
      return emailService;
    },
    get billingTransactionItemRepository() {
      return billingTransactionItemRepository;
    },
    get auditService() {
      return auditService;
    },
  };
}
