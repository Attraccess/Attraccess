import { Repository } from 'typeorm';
import { BillingService } from './billing.service';
import {
  BillingTransaction,
  ResourceBillingConfiguration,
  User,
  Setting,
  BillingTransactionItem,
} from '@attraccess/database-entities';
import { EmailService } from '../email/email.service';
import { mockMetricsService } from './billing.service.spec.mock-metrics-service';
export function createBillingServiceFixture() {
  let service: BillingService;

  let billingTransactionRepository: jest.Mocked<Repository<BillingTransaction>>;

  let userRepository: jest.Mocked<Repository<User>>;

  let settingRepository: jest.Mocked<Repository<Setting>>;

  let resourceBillingConfigurationRepository: jest.Mocked<Repository<ResourceBillingConfiguration>>;

  let liveNotificationsService: { notifyTransactionUpdate: jest.Mock };

  let emailService: jest.Mocked<EmailService>;

  let billingTransactionItemRepository: jest.Mocked<Repository<BillingTransactionItem>>;

  let auditService: { recordBillingTransaction: jest.Mock; recordBillingTransactionAfterCommit: jest.Mock };

  const scope = {
    get billingTransactionRepository() {
      return billingTransactionRepository;
    },
    set billingTransactionRepository(value: typeof billingTransactionRepository) {
      billingTransactionRepository = value;
    },
    get service() {
      return service;
    },
    set service(value: typeof service) {
      service = value;
    },
    get liveNotificationsService() {
      return liveNotificationsService;
    },
    set liveNotificationsService(value: typeof liveNotificationsService) {
      liveNotificationsService = value;
    },
    get auditService() {
      return auditService;
    },
    set auditService(value: typeof auditService) {
      auditService = value;
    },
    get userRepository() {
      return userRepository;
    },
    set userRepository(value: typeof userRepository) {
      userRepository = value;
    },
    get settingRepository() {
      return settingRepository;
    },
    set settingRepository(value: typeof settingRepository) {
      settingRepository = value;
    },
    get resourceBillingConfigurationRepository() {
      return resourceBillingConfigurationRepository;
    },
    set resourceBillingConfigurationRepository(value: typeof resourceBillingConfigurationRepository) {
      resourceBillingConfigurationRepository = value;
    },
    get emailService() {
      return emailService;
    },
    set emailService(value: typeof emailService) {
      emailService = value;
    },
    get billingTransactionItemRepository() {
      return billingTransactionItemRepository;
    },
    set billingTransactionItemRepository(value: typeof billingTransactionItemRepository) {
      billingTransactionItemRepository = value;
    },
    get mockMetricsService() {
      return mockMetricsService;
    },
  };
  return scope;
}
