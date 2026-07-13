import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthenticationDetail, ResourceUsage, Session, User } from '@attraccess/database-entities';
import { DataSource, Repository, UpdateResult } from 'typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { LicenseService } from '../../license/license.service';
import { EmailService } from '../../email/email.service';
import { SSOUsernameChangeForbiddenException } from './errors/ssoUsernameChangeForbidden.exception';
import { TokenHashService } from '../../encryption/token-hash.service';
import { MetricsService } from '../../metrics/metrics.service';
import { RbacService } from '../rbac/rbac.service';

const mockMetricsService = {
  usersRegisteredTotal: { inc: jest.fn() },
  usersTotal: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  usersLocaleSyncsTotal: { inc: jest.fn() },
  usersPerLocale: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
};

const mockRbacService = {
  assignRoleByKey: jest.fn().mockResolvedValue(undefined),
  assignDefaultRoles: jest.fn().mockResolvedValue(undefined),
};

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: jest.Mocked<Repository<User>>;
  let emailService: { sendUsernameChangedEmail: jest.Mock };

  beforeEach(async () => {
    mockRbacService.assignRoleByKey.mockClear();
    mockRbacService.assignDefaultRoles.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
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
            update: jest.fn(),
            findAndCount: jest.fn(),
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
    emailService = module.get(EmailService) as unknown as { sendUsernameChangedEmail: jest.Mock };
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('should validate options using Zod', async () => {
      await expect(service.findOne({})).rejects.toThrow('At least one search criteria must be provided');
    });

    it('should find a user by id', async () => {
      const user = { id: 1, username: 'test' } as User;
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);

      const result = await service.findOne({ id: 1 });
      expect(result).toEqual(user);
    });

    it('should find a user by username', async () => {
      const user = { id: 1, username: 'test' } as User;
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);

      const result = await service.findOne({ username: 'test' });
      expect(result).toEqual(user);
    });

    it('should find a user by email', async () => {
      const user = { id: 1, email: 'test@example.com' } as User;
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);

      const result = await service.findOne({ email: 'test@example.com' });
      expect(result).toEqual(user);
    });

    it('should validate email format', async () => {
      await expect(service.findOne({ email: 'invalid-email' })).rejects.toThrow();
    });
  });

  describe('createOne', () => {
    it('the first created user should be assigned the owner role via RBAC', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'save').mockImplementation(async (data) => ({
        id: 1,
        username: 'test',
        email: 'test@example.com',
        externalIdentifier: null,
        ...data,
      } as User));
      jest.spyOn(userRepository, 'count').mockResolvedValue(0);

      await service.createOne({ username: 'test', email: 'test@example.com', externalIdentifier: null });
      expect(mockRbacService.assignRoleByKey).toHaveBeenCalledWith(1, 'owner', expect.anything());
    });

    it('a subsequent user should be assigned default roles via RBAC', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'save').mockImplementation(async (data) => {
        return { id: 1, ...data } as User;
      });
      jest.spyOn(userRepository, 'count').mockResolvedValue(1);

      const result = await service.createOne({ username: 'test', email: 'test@example.com', externalIdentifier: null });
      expect(result).toEqual({
        id: 1,
        username: 'test',
        email: 'test@example.com',
        externalIdentifier: null,
        isEmailVerified: false,
      });
      expect(mockRbacService.assignDefaultRoles).toHaveBeenCalledWith(1, expect.anything());
      expect(mockRbacService.assignRoleByKey).not.toHaveBeenCalled();
    });

    it('should throw if email already exists', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValueOnce({ id: 1 } as User);

      await expect(
        service.createOne({ username: 'test', email: 'existing@example.com', externalIdentifier: null }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if username already exists', async () => {
      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce({ id: 1 } as User); // username check

      await expect(
        service.createOne({ username: 'existing', email: 'test@example.com', externalIdentifier: null }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('buildUsernameFromSSOClaim', () => {
    it('normalizes usernames from SSO claims', () => {
      const result = service.buildUsernameFromSSOClaim('Name Surname');
      expect(result).toBe('name.surname');
    });

    it('falls back to alternate claim when primary is invalid', () => {
      const result = service.buildUsernameFromSSOClaim('@@@', 'Jane Doe');
      expect(result).toBe('jane.doe');
    });

    it('generates a safe fallback when no candidates are usable', () => {
      const result = service.buildUsernameFromSSOClaim('@@@', ' ');
      expect(result).toMatch(/^sso-user-[a-z0-9_-]{8}$/);
    });
  });

  describe('updateUser', () => {
    it('should update allowed fields and trim values', async () => {
      const updatedUser = {
        id: 1,
        externalIdentifier: 'ext-updated',
      } as User;
      jest.spyOn(userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(updatedUser);

      const result = await service.updateOne(1, { externalIdentifier: '  ext-updated  ' });

      expect(userRepository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ externalIdentifier: 'ext-updated' }),
      );
      expect(result).toEqual(updatedUser);
    });

    it('should update verification tokens', async () => {
      const updatedUser = {
        id: 1,
        emailVerificationToken: 'token',
        emailVerificationTokenExpiresAt: new Date(),
      } as User;
      jest.spyOn(userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(updatedUser);

      const tokenExpiry = new Date();
      const result = await service.updateOne(1, {
        emailVerificationToken: '  token  ',
        emailVerificationTokenExpiresAt: tokenExpiry,
      });

      expect(userRepository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          emailVerificationToken: 'token',
          emailVerificationTokenExpiresAt: tokenExpiry,
        }),
      );
      expect(result).toEqual(updatedUser);
    });

    it('should throw if user not found after update', async () => {
      jest.spyOn(userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.updateOne(1, { externalIdentifier: 'value' })).rejects.toThrow(UserNotFoundException);
    });

  });

  describe('findMany', () => {
    it('should return paginated users', async () => {
      const mockUsers = [
        {
          id: 1,
          username: 'user1',
          email: 'user1@example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
          isEmailVerified: false,
          emailVerificationToken: null,
          emailVerificationTokenExpiresAt: null,
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
          lastUsernameChangeAt: null,
          deleteAccountToken: null,
          deleteAccountTokenExpiresAt: null,
          deleteAccountRequestedAt: null,
          deletedAt: null,
          resourceIntroductions: [],
          resourceUsages: [],
          resourceIntroducers: [],
          groupMemberships: [],
          nfcCards: [],
          authenticationDetails: [],
          resourceIntroducerPermissions: [],
          externalIdentifier: null,
          nfcKeySeedToken: null,
          ownedProjects: [],
          sessions: [],
          billingTransactions: [],
          initiatedBillingTransactions: [],
          creditBalance: 0,
          billingFactor: 100,
          projectMemberships: [],
          sentProjectInvitations: [],
          receivedProjectInvitations: [],
          formSubmissions: [],
          lockedUntil: null,
          failedLoginAttempts: 0,
          firstFailedLoginAt: null,
          locale: 'en',
        } as User,
        {
          id: 2,
          username: 'user2',
          email: 'user2@example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
          isEmailVerified: false,
          emailVerificationToken: null,
          emailVerificationTokenExpiresAt: null,
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
          lastUsernameChangeAt: null,
          deleteAccountToken: null,
          deleteAccountTokenExpiresAt: null,
          deleteAccountRequestedAt: null,
          deletedAt: null,
          resourceIntroductions: [],
          resourceUsages: [],
          resourceIntroducers: [],
          groupMemberships: [],
          nfcCards: [],
          authenticationDetails: [],
          resourceIntroducerPermissions: [],
          externalIdentifier: null,
          nfcKeySeedToken: null,
          ownedProjects: [],
          sessions: [],
          billingTransactions: [],
          initiatedBillingTransactions: [],
          creditBalance: 0,
          billingFactor: 100,
          projectMemberships: [],
          sentProjectInvitations: [],
          receivedProjectInvitations: [],
          formSubmissions: [],
          lockedUntil: null,
          failedLoginAttempts: 0,
          firstFailedLoginAt: null,
          locale: 'en',
        } as User,
      ];

      userRepository.findAndCount.mockResolvedValue([mockUsers, 2]);

      const result = await service.findMany({ page: 1, limit: 10 });

      expect(result.data).toEqual(mockUsers);
      expect(result.total).toEqual(2);
      expect(result.page).toEqual(1);
      expect(result.limit).toEqual(10);
      expect(userRepository.findAndCount).toHaveBeenCalled();
    });

    it('should order users by username ascending', async () => {
      userRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findMany({ page: 1, limit: 10 });

      expect(userRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ order: { username: 'ASC' } }),
      );
    });

    it('should throw error for invalid pagination options', async () => {
      await expect(service.findMany({ page: 0, limit: 10 })).rejects.toThrow();
      await expect(service.findMany({ page: 1, limit: 0 })).rejects.toThrow();
    });
  });

  describe('changeUsername', () => {
    beforeEach(() => {
      jest.spyOn(service, 'isSSOUser').mockResolvedValue(false);
    });

    const baseUser = (overrides: Partial<User> = {}): User =>
      ({
        id: 1,
        username: 'olduser',
        email: 'user@example.com',

        createdAt: new Date(),
        updatedAt: new Date(),
        isEmailVerified: false,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
        lastUsernameChangeAt: null,
        resourceIntroductions: [],
        resourceUsages: [],
        resourceIntroducers: [],
        groupMemberships: [],
        nfcCards: [],
        authenticationDetails: [],
        resourceIntroducerPermissions: [],
        externalIdentifier: null,
        nfcKeySeedToken: null,
        ownedProjects: [],
        sessions: [],
        ...overrides,
      }) as User;

    it('should throw if target user not found', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(null);

      await expect(service.changeUsername(123, 'newuser', baseUser())).rejects.toThrow(UserNotFoundException);
    });

    it("should forbid changing another user's username without permission", async () => {
      const target = baseUser({ id: 2 });
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(target);

      await expect(service.changeUsername(2, 'newuser', baseUser({ id: 1 }))).rejects.toThrow(ForbiddenException);
    });

    it('should enforce once-per-day limit for self-change when not admin', async () => {
      const recent = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const me = baseUser({ id: 10, lastUsernameChangeAt: recent });
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(me);

      await expect(service.changeUsername(10, 'newuser', me)).rejects.toThrow(BadRequestException);
    });

    it('should allow self-change and update lastUsernameChangeAt and send email', async () => {
      const me = baseUser({ id: 10, username: 'me' });
      const updated = { ...me, username: 'newuser', lastUsernameChangeAt: new Date() } as User;
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(me).mockResolvedValueOnce(updated);
      const updateSpy = jest.spyOn(userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);

      const result = await service.changeUsername(10, 'newuser', me);

      expect(updateSpy).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          username: 'newuser',
          lastUsernameChangeAt: expect.any(Date),
        }),
      );
      expect(emailService.sendUsernameChangedEmail).toHaveBeenCalledWith(updated, 'me');
      expect(result).toBe(updated);
    });

    it("should allow admin to change another user's username without altering lastUsernameChangeAt", async () => {
      const target = baseUser({ id: 20, username: 'target', lastUsernameChangeAt: null });
      const admin = baseUser({
        id: 1,
        effectivePermissions: new Set(['users.update']),
      } as never);
      const updated = { ...target, username: 'new_admin_set', lastUsernameChangeAt: null } as User;
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(target).mockResolvedValueOnce(updated);
      const updateSpy = jest.spyOn(userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);

      const result = await service.changeUsername(20, 'new_admin_set', admin);

      expect(updateSpy).toHaveBeenCalledWith(
        20,
        expect.objectContaining({
          username: 'new_admin_set',
        }),
      );
      expect(emailService.sendUsernameChangedEmail).toHaveBeenCalledWith(updated, 'target');
      expect(result).toBe(updated);
    });

    it('should validate new username format', async () => {
      const me = baseUser({ id: 10 });
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(me);

      await expect(service.changeUsername(10, 'x', me)).rejects.toThrow(BadRequestException);
    });

    it('should forbid changing username for SSO users', async () => {
      const me = baseUser({ id: 5 });
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(me);
      jest.spyOn(service, 'isSSOUser').mockResolvedValueOnce(true);

      await expect(service.changeUsername(5, 'newuser', me)).rejects.toThrow(SSOUsernameChangeForbiddenException);
    });
  });

  describe('createOne – locale', () => {
    beforeEach(() => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'count').mockResolvedValue(1);
      jest.spyOn(userRepository, 'save').mockImplementation(async (data) => ({ id: 99, ...data }) as User);
    });

    it('sets locale when provided', async () => {
      await service.createOne({ username: 'usr', email: 'u@x.com', externalIdentifier: null, locale: 'de' });
      expect(userRepository.save).toHaveBeenCalledWith(expect.objectContaining({ locale: 'de' }));
      expect(mockMetricsService.usersPerLocale.inc).toHaveBeenCalledWith({ locale: 'de' });
    });

    it('stores the full BCP 47 locale tag without lowercasing or truncating', async () => {
      await service.createOne({ username: 'usr', email: 'u@x.com', externalIdentifier: null, locale: 'ZH-Hant-TW' });
      expect(userRepository.save).toHaveBeenCalledWith(expect.objectContaining({ locale: 'ZH-Hant-TW' }));
    });

    it('leaves locale at column default when not provided', async () => {
      await service.createOne({ username: 'usr', email: 'u@x.com', externalIdentifier: null });
      const saved = (userRepository.save as jest.Mock).mock.calls[0][0] as Partial<User>;
      expect(saved.locale).toBeUndefined();
    });
  });

  describe('updateLocale', () => {
    it('saves cleaned locale, updates gauge, and returns user', async () => {
      const existing = { id: 1, locale: 'en' } as User;
      const updated = { id: 1, locale: 'de' } as User;
      jest.spyOn(userRepository, 'update').mockResolvedValue({} as UpdateResult);
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);

      const result = await service.updateLocale(1, 'de-DE');
      expect(userRepository.update).toHaveBeenCalledWith(1, { locale: 'de-DE' });
      expect(mockMetricsService.usersLocaleSyncsTotal.inc).toHaveBeenCalledWith({ locale: 'de-DE' });
      expect(mockMetricsService.usersPerLocale.dec).toHaveBeenCalledWith({ locale: 'en' });
      expect(mockMetricsService.usersPerLocale.inc).toHaveBeenCalledWith({ locale: 'de-DE' });
      expect(result).toEqual(updated);
    });

    it('throws BadRequestException for empty locale', async () => {
      await expect(service.updateLocale(1, '   ')).rejects.toThrow(BadRequestException);
    });
  });
});
