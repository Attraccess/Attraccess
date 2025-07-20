import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '@attraccess/database-entities';
import { Repository, UpdateResult } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
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
        service.createOne({ username: 'test', email: 'existing@example.com', externalIdentifier: null })
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if username already exists', async () => {
      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce({ id: 1 } as User); // username check

      await expect(
        service.createOne({ username: 'existing', email: 'test@example.com', externalIdentifier: null })
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
          },
          createdAt: new Date(),
          updatedAt: new Date(),
          isEmailVerified: false,
          emailVerificationToken: null,
          emailVerificationTokenExpiresAt: null,
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
          resourceIntroductions: [],
          resourceUsages: [],
          resourceIntroducers: [],
          groupMemberships: [],
          nfcCards: [],
          authenticationDetails: [],
          resourceIntroducerPermissions: [],
          externalIdentifier: null,
          sessions: [],
        } as User,
        {
          id: 2,
          username: 'user2',
          email: 'user2@example.com',
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
          resourceIntroductions: [],
          resourceUsages: [],
          resourceIntroducers: [],
          groupMemberships: [],
          nfcCards: [],
          authenticationDetails: [],
          resourceIntroducerPermissions: [],
          externalIdentifier: null,
          sessions: [],
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
});
