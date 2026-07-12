import { Test, TestingModule } from '@nestjs/testing';
import { UsersAdminController } from './users-admin.controller';
import { UsersService } from './users.service';
import { UserPasswordService } from './user-password.service';
import { BruteForceProtectionService } from '../rate-limiting/brute-force.service';
import { AuthAuditLogger } from '../rate-limiting/auth-audit.logger';
import { User } from '@attraccess/database-entities';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';

describe('UsersAdminController', () => {
  let controller: UsersAdminController;
  let usersService: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersAdminController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
            findMany: jest.fn(),
            deleteOne: jest.fn(),
            changeUsername: jest.fn(),
            changeEmail: jest.fn(),
            changeBillingFactor: jest.fn(),
          },
        },
        {
          provide: UserPasswordService,
          useValue: { setUserPassword: jest.fn() },
        },
        {
          provide: BruteForceProtectionService,
          useValue: {
            assertIpAllowed: jest.fn().mockResolvedValue(undefined),
            assertAccountAllowed: jest.fn().mockResolvedValue(undefined),
            recordFailure: jest.fn().mockResolvedValue(undefined),
            recordSuccess: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: AuthAuditLogger, useValue: { log: jest.fn() } },
      ],
    }).compile();

    controller = module.get<UsersAdminController>(UsersAdminController);
    usersService = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findMany', () => {
    const paginated = (page: number, limit: number, total: number) => ({
      data: [] as User[],
      total,
      page,
      limit,
    });

    it('should set nextPage when more pages exist', async () => {
      jest.spyOn(usersService, 'findMany').mockResolvedValue(paginated(1, 10, 25));

      const result = await controller.findMany({ page: 1, limit: 10 });

      expect(result.nextPage).toBe(2);
    });

    it('should not set nextPage when the last page ends exactly at the total', async () => {
      jest.spyOn(usersService, 'findMany').mockResolvedValue(paginated(2, 10, 20));

      const result = await controller.findMany({ page: 2, limit: 10 });

      expect(result.nextPage).toBeUndefined();
    });

    it('should not set nextPage on a partially filled last page', async () => {
      jest.spyOn(usersService, 'findMany').mockResolvedValue(paginated(3, 10, 25));

      const result = await controller.findMany({ page: 3, limit: 10 });

      expect(result.nextPage).toBeUndefined();
    });
  });

  describe('getOneById', () => {
    it('should return a user by ID', async () => {
      const user = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        isEmailVerified: true,
        systemPermissions: {},
        authenticationDetails: [],
      } as User;

      jest.spyOn(usersService, 'findOne').mockResolvedValue(user);

      const mockRequest: Partial<AuthenticatedRequest> = {
        user: {
          ...user,
          jwtTokenId: 'test-jwt-token-id',
        },
        authInfo: { tokenId: 'test-token' },
        logout: jest.fn(),
      };

      const response = await controller.getOneById(user.id, mockRequest as AuthenticatedRequest);
      expect(response).toEqual(user);
    });
  });
});
