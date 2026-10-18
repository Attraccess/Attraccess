import { DatabaseTransactions, OperationToken, TransactionScope } from '../../database/transaction-scope';
import { UserPersistence } from './persistence/port';
import { TypeormUserPersistence } from './persistence/typeorm-adapter';
import { SettingsService } from '../../settings/settings.service';
import { AuthenticationDetail, ResourceUsage, Session, User } from '@attraccess/database-entities';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
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

  let userRepository: jest.Mocked<Repository<User>>;

  let dataSource: jest.Mocked<DataSource>;

  let emailService: { sendUsernameChangedEmail: jest.Mock; sendVerificationEmail: jest.Mock };

  let repositories: [Repository<AuthenticationDetail>, Repository<Session>, Repository<ResourceUsage>];
  const bind = (manager: EntityManager) => {
    const repo = <T extends ObjectLiteral>(type: EntityTarget<T>, fallback: Repository<T>): Repository<T> =>
      manager.getRepository ? manager.getRepository(type) : fallback;
    return new TypeormUserPersistence(
      repo(User, userRepository),
      repo(AuthenticationDetail, repositories[0]),
      repo(Session, repositories[1]),
      repo(ResourceUsage, repositories[2]),
      manager,
    );
  };
  beforeEach(async () => {
    settingsService.getDefaultLanguage.mockResolvedValue('en');
    mockRbacService.assignRoleByKey.mockClear();
    mockRbacService.assignDefaultRoles.mockClear();
    mockRbacService.isLastAdministrator.mockClear();
    mockRbacService.isLastAdministrator.mockResolvedValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: SettingsService, useValue: settingsService },
        {
          provide: UserPersistence,
          useFactory: (users, auth, sessions, usages) => new TypeormUserPersistence(users, auth, sessions, usages),
          inject: [
            getRepositoryToken(User),
            getRepositoryToken(AuthenticationDetail),
            getRepositoryToken(Session),
            getRepositoryToken(ResourceUsage),
          ],
        },
        {
          provide: DatabaseTransactions,
          useFactory: (source: DataSource) =>
            new DatabaseTransactions({
              backend: 'sqlite',
              run: async (_conflicts, work) =>
                source.transaction(async (manager) =>
                  work({
                    resolve: <T extends object>(_token: OperationToken<T>) =>
                      bind(manager as EntityManager) as unknown as T,
                  }),
                ),
            }),
          inject: [DataSource],
        },
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
          provide: DataSource,
          useValue: {
            // Call the callback with a mock EntityManager that delegates save() to
            // userRepository.save so per-test mocks on the repository still apply.
            transaction: jest.fn().mockImplementation(async (cb: (em: unknown) => Promise<unknown>) => {
              const em = {
                save: jest.fn().mockImplementation((entity: unknown) => userRepository.save(entity as User)),
              };
              return cb(em);
            }),
          },
        },
        {
          provide: TokenHashService,
          useValue: {
            hashToken: jest.fn((token: string) => `hashed:${token}`),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            create: jest.fn((data) => Object.assign(new User(), data)),
            delete: jest.fn(),
            softDelete: jest.fn(),
            update: jest.fn(),
            findAndCount: jest.fn(),
            createQueryBuilder: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AuthenticationDetail),
          useValue: {
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Session),
          useValue: {
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ResourceUsage),
          useValue: {
            count: jest.fn(),
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
    userRepository = module.get(getRepositoryToken(User)) as jest.Mocked<Repository<User>>;
    repositories = [
      module.get(getRepositoryToken(AuthenticationDetail)),
      module.get(getRepositoryToken(Session)),
      module.get(getRepositoryToken(ResourceUsage)),
    ];
    dataSource = module.get(DataSource) as jest.Mocked<DataSource>;
    emailService = module.get(EmailService) as unknown as {
      sendUsernameChangedEmail: jest.Mock;
      sendVerificationEmail: jest.Mock;
    };
  });
  return {
    parentScope(manager: unknown): TransactionScope {
      return {
        backend: 'sqlite',
        conflicts: { resourceIds: [], accountIds: [] },
        afterCommit: jest.fn(),
        resolve: <T extends object>(_token: OperationToken<T>) => bind(manager as EntityManager) as unknown as T,
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
    get userRepository() {
      return userRepository;
    },
    get dataSource() {
      return dataSource;
    },
    get emailService() {
      return emailService;
    },
  };
}
