import { userOperationsFake } from './persistence/operations.test-fixture';
import { USER_WRITES, UserOperations } from './persistence/port';
import { operationTransactionsFake } from '../../database/testing/operation-transactions.test-fixture';
import { DatabaseTransactions, OperationToken, TransactionScope } from '../../database/transaction-scope';
import { UserPersistence } from './persistence/port';
import { SettingsService } from '../../settings/settings.service';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../../email/email.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { LicenseService } from '../../license/license.service';
import { MetricsService } from '../../metrics/metrics.service';
import { RbacService } from '../rbac/rbac.service';
import { UsersService } from './users.service';

const settingsService = {
  getDefaultLanguage: jest.fn().mockResolvedValue('en'),
  resolveLanguage: jest.fn(
    async (locale: string | undefined) => locale?.trim() || settingsService.getDefaultLanguage(),
  ),
};

const mockMetricsService = {
  usersRegisteredTotal: { inc: jest.fn() },
  usersTotal: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  usersLocaleSyncsTotal: { inc: jest.fn() },
  usersPerLocale: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
};

const mockRbacService = {
  assignRoleByKey: jest.fn().mockResolvedValue(undefined),
  assignDefaultRoles: jest.fn().mockResolvedValue(undefined),
  getEffectivePermissions: jest.fn().mockResolvedValue(new Set()),
  isLastAdministrator: jest.fn().mockResolvedValue(false),
};
export function registerUsersServiceFixture() {
  let service: UsersService;

  let persistence: jest.Mocked<UserPersistence>;
  let driver: ReturnType<typeof operationTransactionsFake>;
  let emailService: { sendUsernameChangedEmail: jest.Mock; sendVerificationEmail: jest.Mock };

  beforeEach(async () => {
    persistence = userOperationsFake();
    driver = operationTransactionsFake();
    driver.bind(USER_WRITES, persistence);
    settingsService.getDefaultLanguage.mockResolvedValue('en');
    mockRbacService.assignRoleByKey.mockClear();
    mockRbacService.assignDefaultRoles.mockClear();
    mockRbacService.isLastAdministrator.mockClear();
    mockRbacService.isLastAdministrator.mockResolvedValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: SettingsService, useValue: settingsService },
        { provide: UserPersistence, useValue: persistence },
        { provide: DatabaseTransactions, useValue: driver.transactions },
        {
          provide: LicenseService,
          useValue: {
            verifyLicense: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendUsernameChangedEmail: jest.fn(),
            sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TokenHashService,
          useValue: {
            hashToken: jest.fn((token: string) => `hashed:${token}`),
          },
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: RbacService,
          useValue: mockRbacService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    emailService = module.get(EmailService) as unknown as {
      sendUsernameChangedEmail: jest.Mock;
      sendVerificationEmail: jest.Mock;
    };
  });
  return {
    parentScope(operations: UserOperations): TransactionScope {
      return {
        backend: 'fake',
        conflicts: { resourceIds: [], accountIds: [] },
        afterCommit: jest.fn(),
        resolve: <T extends object>(_token: OperationToken<T>) => operations as unknown as T,
      };
    },
    get settingsService() {
      return settingsService;
    },
    get mockMetricsService() {
      return mockMetricsService;
    },
    get mockRbacService() {
      return mockRbacService;
    },
    get service() {
      return service;
    },
    get persistence() {
      return persistence;
    },
    get driver() {
      return driver;
    },
    get emailService() {
      return emailService;
    },
  };
}
