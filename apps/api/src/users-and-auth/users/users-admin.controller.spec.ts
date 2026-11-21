import { UserAdministrationService } from './user-administration.service';
import { AUDIT_RECORDER } from '../../audit/recorder/audit-event';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { UsersAdminController } from './users-admin.controller';
import { UsersService } from './users.service';
import { UserPasswordService } from './user-password.service';
import { BruteForceProtectionService } from '../rate-limiting/brute-force.service';
import { AuthAuditLogger } from '../rate-limiting/auth-audit.logger';
import { AuthenticationType, SSOProviderType, type UserAccount as User } from '@attraccess/application-models';
import { toUserAccountDto } from './dtos/user.dto';
import { aUserRecord } from './fakes/in-memory-user-store.test-fixture';

const PRIVATE_FIELDS = [
  'email',
  'emailVerificationToken',
  'emailVerificationTokenExpiresAt',
  'passwordResetToken',
  'passwordResetTokenExpiresAt',
  'lastUsernameChangeAt',
  'lockedUntil',
  'failedLoginAttempts',
  'firstFailedLoginAt',
  'deleteAccountToken',
  'deleteAccountTokenExpiresAt',
  'deleteAccountRequestedAt',
  'nfcKeySeedToken',
  'password',
  'totpSecret',
];

function expectNoPrivateFields(body: unknown) {
  const json = JSON.parse(JSON.stringify(body));
  for (const field of PRIVATE_FIELDS) expect(json).not.toHaveProperty(field);
}
import { AuthenticatedRequest, DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';

describe('UsersAdminController', () => {
  let controller: UsersAdminController;
  let usersService: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersAdminController],
      providers: [
        UserAdministrationService,
        { provide: AUDIT_RECORDER, useValue: { record: jest.fn() } },
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

    const makeRequest = (permissions: string[] = []): AuthenticatedRequest =>
      ({
        user: {
          id: 99,
          jwtTokenId: 'tok',
          effectivePermissions: new Set<string>(permissions),
        },
        authInfo: { tokenId: 'tok' },
        logout: jest.fn(),
      }) as unknown as AuthenticatedRequest;

    it('should set nextPage when more pages exist', async () => {
      jest.spyOn(usersService, 'findMany').mockResolvedValue(paginated(1, 10, 25));

      const result = await controller.findMany({ page: 1, limit: 10 }, makeRequest());

      expect(result.nextPage).toBe(2);
    });

    it('should not set nextPage when the last page ends exactly at the total', async () => {
      jest.spyOn(usersService, 'findMany').mockResolvedValue(paginated(2, 10, 20));

      const result = await controller.findMany({ page: 2, limit: 10 }, makeRequest());

      expect(result.nextPage).toBeUndefined();
    });

    it('should not set nextPage on a partially filled last page', async () => {
      jest.spyOn(usersService, 'findMany').mockResolvedValue(paginated(3, 10, 25));

      const result = await controller.findMany({ page: 3, limit: 10 }, makeRequest());

      expect(result.nextPage).toBeUndefined();
    });

    it('should return roles when includeRoles=true and caller has users.read', async () => {
      jest.spyOn(usersService, 'findMany').mockResolvedValue(paginated(1, 10, 1));

      const result = await controller.findMany({ page: 1, limit: 10, includeRoles: true }, makeRequest(['users.read']));

      expect(usersService.findMany).toHaveBeenCalledWith(expect.objectContaining({ includeRoles: true }));
      expect(result).toBeDefined();
    });

    it('should forward roleId to the users service', async () => {
      jest.spyOn(usersService, 'findMany').mockResolvedValue(paginated(1, 10, 1));

      await controller.findMany({ page: 1, limit: 10, roleId: 42 }, makeRequest(['users.read']));

      expect(usersService.findMany).toHaveBeenCalledWith(expect.objectContaining({ roleId: 42 }));
    });

    it('should forward advanced user filters to the users service', async () => {
      jest.spyOn(usersService, 'findMany').mockResolvedValue(paginated(1, 10, 1));

      await controller.findMany(
        {
          page: 1,
          limit: 10,
          roleIds: [2, 4],
          excludeRoleIds: [5],
          roleMatch: 'all',
          emailVerified: true,
          ssoProviderIds: [7],
          excludeSsoProviderIds: [8],
          ssoProviderNone: true,
          hasSsoProvider: false,
          ssoProviderMatch: 'any',
        },
        makeRequest(['users.read']),
      );

      expect(usersService.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          roleIds: [2, 4],
          excludeRoleIds: [5],
          roleMatch: 'all',
          emailVerified: true,
          ssoProviderIds: [7],
          excludeSsoProviderIds: [8],
          ssoProviderNone: true,
          hasSsoProvider: false,
          ssoProviderMatch: 'any',
        }),
      );
    });

    it('returns only id, username and the names without users.read', async () => {
      jest.spyOn(usersService, 'findMany').mockResolvedValue({
        ...paginated(1, 10, 1),
        data: [
          {
            id: 1,
            username: 'member',
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
            creditBalance: 100,
            billingFactor: 2,
            isEmailVerified: false,
            authenticationDetails: [{ providerType: 'local_password' }],
          } as User,
        ],
      });

      const result = await controller.findMany({ page: 1, limit: 10 }, makeRequest());

      expect(result).toStrictEqual({
        data: [{ id: 1, username: 'member', firstName: 'Ada', lastName: 'Lovelace' }],
        total: 1,
        page: 1,
        limit: 10,
        nextPage: undefined,
      });
    });

    it('should return the full user shape with users.read', async () => {
      const user = aUserRecord({
        id: 1,
        username: 'admin',
        creditBalance: 100,
        billingFactor: 2,
        isEmailVerified: true,
        passwordResetToken: 'secret-reset-token',
        deleteAccountToken: 'secret-delete-token',
        failedLoginAttempts: 3,
        authenticationDetails: [
          {
            id: 4,
            userId: 1,
            type: AuthenticationType.SSO,
            providerType: SSOProviderType.OIDC,
            providerId: 2,
            ssoSubject: 'sub',
          },
        ],
      });
      jest.spyOn(usersService, 'findMany').mockResolvedValue({ ...paginated(1, 10, 1), data: [user] });

      const result = await controller.findMany({ page: 1, limit: 10 }, makeRequest(['users.read']));

      expect(result.data).toEqual([toUserAccountDto(user)]);
      expect(result.data[0]).toMatchObject({
        id: 1,
        username: 'admin',
        authenticationDetails: [expect.objectContaining({ providerType: SSOProviderType.OIDC, ssoSubject: 'sub' })],
      });
      expectNoPrivateFields(result.data[0]);
    });

    it('should throw ForbiddenException when includeRoles=true without users.read', async () => {
      await expect(controller.findMany({ page: 1, limit: 10, includeRoles: true }, makeRequest())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when roleId is supplied without users.read', async () => {
      await expect(controller.findMany({ page: 1, limit: 10, roleId: 42 }, makeRequest())).rejects.toThrow(
        ForbiddenException,
      );
      expect(usersService.findMany).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when advanced filters are supplied without users.read', async () => {
      await expect(controller.findMany({ page: 1, limit: 10, emailVerified: true }, makeRequest())).rejects.toThrow(
        ForbiddenException,
      );
      expect(usersService.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getOneById', () => {
    it('should return a user by ID', async () => {
      const user = aUserRecord({
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        isEmailVerified: true,
        emailVerificationToken: 'secret-verification-token',
        lockedUntil: new Date(),
        authenticationDetails: [],
      });

      jest.spyOn(usersService, 'findOne').mockResolvedValue(user);

      const mockRequest: Partial<AuthenticatedRequest> = {
        user: {
          ...user,
          jwtTokenId: 'test-jwt-token-id',
          effectivePermissions: new Set<string>(),
        },
        authInfo: { tokenId: 'test-token' },
        logout: jest.fn(),
      };

      const response = await controller.getOneById(user.id, mockRequest as AuthenticatedRequest);
      expect(response).toEqual(toUserAccountDto(user));
      expectNoPrivateFields(response);
    });
  });

  describe('PATCH /users/:id/name permissions', () => {
    it('requires users.update, like changing the username', () => {
      for (const handler of [
        UsersAdminController.prototype.changeUserName,
        UsersAdminController.prototype.changeUserUsername,
      ]) {
        expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual(
          expect.arrayContaining([DualAuthGuard, EffectivePermissionsGuard]),
        );
        const request = { user: { id: 1, effectivePermissions: new Set(['users.read']) } };
        const check = () =>
          new EffectivePermissionsGuard(new Reflector()).canActivate(
            new ExecutionContextHost([request], UsersAdminController, handler),
          );

        expect(() => check()).toThrow('Insufficient permissions');
        request.user.effectivePermissions.add('users.update');
        expect(check()).toBe(true);
      }
    });
  });
});
