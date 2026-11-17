import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../../email/email.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { LicenseService } from '../../license/license.service';
import { MetricsService } from '../../metrics/metrics.service';
import { UNIT_OF_WORK } from '../../database/unit-of-work';
import { RbacService } from '../rbac/rbac.service';
import { RBAC_STORE } from '../rbac/rbac.port';
import { UsersService } from './users.service';
import { UserAccounts } from './accounts/user-accounts';
import { UserDirectory } from './directory/user-directory';
import { USER_STORE } from './user-store.port';
import { FakeUnitOfWork, InMemoryUserStore } from './fakes/in-memory-user-store.test-fixture';

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
  let store: InMemoryUserStore;
  let uow: FakeUnitOfWork;
  let rbacStore: { findRoleByKey: jest.Mock };
  let licenseService: { verifyLicense: jest.Mock };
  let emailService: {
    sendUsernameChangedEmail: jest.Mock;
    sendVerificationEmail: jest.Mock;
    sendDeleteAccountConfirmationEmail: jest.Mock;
  };
  let accounts: UserAccounts;

  beforeEach(async () => {
    for (const mock of Object.values(mockRbacService)) mock.mockClear();
    for (const gauge of Object.values(mockMetricsService)) for (const fn of Object.values(gauge)) fn.mockClear();
    mockRbacService.isLastAdministrator.mockResolvedValue(false);
    store = new InMemoryUserStore();
    uow = new FakeUnitOfWork();
    rbacStore = { findRoleByKey: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        UserAccounts,
        UserDirectory,
        { provide: USER_STORE, useValue: store },
        { provide: UNIT_OF_WORK, useValue: uow },
        { provide: RBAC_STORE, useValue: rbacStore },
        { provide: LicenseService, useValue: { verifyLicense: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: EmailService,
          useValue: {
            sendUsernameChangedEmail: jest.fn(),
            sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
            sendDeleteAccountConfirmationEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: TokenHashService, useValue: { hashToken: jest.fn((token: string) => `hashed:${token}`) } },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: RbacService, useValue: mockRbacService },
      ],
    }).compile();

    service = module.get(UsersService);
    accounts = module.get(UserAccounts);
    licenseService = module.get(LicenseService);
    emailService = module.get(EmailService);
  });

  return {
    get mockMetricsService() {
      return mockMetricsService;
    },
    get mockRbacService() {
      return mockRbacService;
    },
    get accounts() {
      return accounts;
    },
    get service() {
      return service;
    },
    get store() {
      return store;
    },
    get uow() {
      return uow;
    },
    get rbacStore() {
      return rbacStore;
    },
    get licenseService() {
      return licenseService;
    },
    get emailService() {
      return emailService;
    },
  };
}
