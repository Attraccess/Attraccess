import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '@attraccess/database-entities';
import { Repository, UpdateResult } from 'typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { LicenseService } from '../../license/license.service';
import { EmailService } from '../../email/email.service';

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: jest.Mocked<Repository<User>>;
  let emailService: { sendUsernameChangedEmail: jest.Mock };

  beforeEach(async () => {
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
    it('the first created user should have all permissions', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'save').mockImplementation(async (data) => {
        return {
          id: 1,
          ...data,
          systemPermissions: {
            canManageResources: false,
            canManageSystemConfiguration: false,
            canManageUsers: false,
            ...(data.systemPermissions || {}),
          },
        } as User;
      });
      jest.spyOn(userRepository, 'count').mockResolvedValue(0);

      const result = await service.createOne({ username: 'test', email: 'test@example.com', externalIdentifier: null });
      expect(result).toEqual({
        id: 1,
        username: 'test',
        email: 'test@example.com',
        externalIdentifier: null,
        systemPermissions: {
          canManageResources: true,
          canManageSystemConfiguration: true,
          canManageUsers: true,
          canManageBilling: true,
        },
      });
    });

    it('the following created user should not have any permissions', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'save').mockImplementation(async (data) => {
        return {
          id: 1,
          ...data,
          systemPermissions: {
            canManageResources: false,
            canManageSystemConfiguration: false,
            ...(data.systemPermissions || {}),
          },
        } as User;
      });
      jest.spyOn(userRepository, 'count').mockResolvedValue(1);

      const result = await service.createOne({ username: 'test', email: 'test@example.com', externalIdentifier: null });
      expect(result).toEqual({
        id: 1,
        username: 'test',
        email: 'test@example.com',
        externalIdentifier: null,
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
        },
      });
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

  describe('updateUser', () => {
    it('should update a user', async () => {
      const user = {
        id: 1,
        username: 'test',
        email: 'test@example.com',
      } as User;
      jest.spyOn(userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);

      const result = await service.updateOne(1, { username: 'updated' });
      expect(result).toEqual(user);
    });

    it('should check email uniqueness on update', async () => {
      const existingUsers = [{ id: 2, email: 'existing@example.com' } as User];
      jest.spyOn(userRepository, 'find').mockResolvedValue(existingUsers);

      await expect(service.updateOne(1, { email: 'existing@example.com' })).rejects.toThrow(BadRequestException);
    });

    it('should allow updating to same email', async () => {
      const user = { id: 1, email: 'test@example.com' } as User;
      const existingUsers = [user];
      jest.spyOn(userRepository, 'find').mockResolvedValue(existingUsers);
      jest.spyOn(userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);

      const result = await service.updateOne(1, { email: 'test@example.com' });
      expect(result).toEqual(user);
    });

    it('should throw if user not found', async () => {
      jest.spyOn(userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.updateOne(1, { username: 'test' })).rejects.toThrow(UserNotFoundException);
    });
  });

  describe('findMany', () => {
    it('should return paginated users', async () => {
      const mockUsers = [
        {
          id: 1,
          username: 'user1',
          email: 'user1@example.com',
          systemPermissions: {
            canManageResources: false,
            canManageSystemConfiguration: false,
            canManageUsers: false,
            canManageBilling: false,
          },
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
          sessions: [],
          billingTransactions: [],
          initiatedBillingTransactions: [],
          creditBalance: 0,
        } as User,
        {
          id: 2,
          username: 'user2',
          email: 'user2@example.com',
          systemPermissions: {
            canManageResources: false,
            canManageSystemConfiguration: false,
            canManageUsers: false,
            canManageBilling: false,
          },
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
          sessions: [],
          billingTransactions: [],
          initiatedBillingTransactions: [],
          creditBalance: 0,
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

    it('should throw error for invalid pagination options', async () => {
      await expect(service.findMany({ page: 0, limit: 10 })).rejects.toThrow();
      await expect(service.findMany({ page: 1, limit: 0 })).rejects.toThrow();
    });
  });

  describe('changeUsername', () => {
    const baseUser = (overrides: Partial<User> = {}): User =>
      ({
        id: 1,
        username: 'olduser',
        email: 'user@example.com',
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: false,
        },
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
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(me);

      const updated = { ...me, username: 'newuser', lastUsernameChangeAt: new Date() } as User;
      const updateSpy = jest.spyOn(service, 'updateOne').mockResolvedValueOnce(updated);

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
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: true,
          canManageBilling: false,
        },
      });
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(target);

      const updated = { ...target, username: 'new_admin_set' } as User;
      const updateSpy = jest.spyOn(service, 'updateOne').mockResolvedValueOnce(updated);

      const result = await service.changeUsername(20, 'new_admin_set', admin);

      expect(updateSpy).toHaveBeenCalledWith(20, {
        username: 'new_admin_set',
        lastUsernameChangeAt: null,
      });
      expect(emailService.sendUsernameChangedEmail).toHaveBeenCalledWith(updated, 'target');
      expect(result).toBe(updated);
    });

    it('should validate new username format', async () => {
      const me = baseUser({ id: 10 });
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(me);

      await expect(service.changeUsername(10, 'x', me)).rejects.toThrow(BadRequestException);
    });
  });
});
