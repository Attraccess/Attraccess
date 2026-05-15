import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../../email/email.service';
import { SSOService } from '../auth/sso/sso.service';
import { User, AuthenticationType, Setting, SSOProviderType, SystemPermissions } from '@attraccess/database-entities';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { CreateUserDto } from './dtos/createUser.dto';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenSignupDomainException } from './errors/forbiddenSignupDomain.exception';
import { CsvInviteConfigDto } from './dtos/csvInvite.dto';
import { FileUpload } from '../../common/types/file-upload.types';
import { TokenHashService } from '../../encryption/token-hash.service';
import { ForbiddenException } from '@nestjs/common';
import { BruteForceProtectionService } from '../rate-limiting/brute-force.service';
import { AuthAuditLogger } from '../rate-limiting/auth-audit.logger';
import { PasswordPolicyService } from '../password-policy/password-policy.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: UsersService;
  let authService: AuthService;
  let emailService: EmailService;
  let ssoService: SSOService;
  let settingRepository: {
    findOne: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
            findMany: jest.fn(),
            createOne: jest.fn(),
            deleteOne: jest.fn(),
            updateOne: jest.fn(),
            countUsers: jest.fn(),
            changeEmail: jest.fn(),
            cleanupUsername: jest.fn((value: string) => value),
            validateUsernameOrThrow: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            createJWT: jest.fn(),
            addAuthenticationDetails: jest.fn(),
            generateEmailVerificationToken: jest.fn(),
            removeAuthenticationDetails: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendVerificationEmail: jest.fn(),
          },
        },
        {
          provide: SSOService,
          useValue: {
            getProviderByTypeAndIdWithConfiguration: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Setting),
          useValue: {
            findOne: jest.fn(),
            insert: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: TokenHashService,
          useValue: {
            hashToken: jest.fn((token: string) => `hashed:${token}`),
          },
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
        {
          provide: AuthAuditLogger,
          useValue: { log: jest.fn() },
        },
        {
          provide: PasswordPolicyService,
          useValue: {
            validate: jest.fn(async () => ({ ok: true, errors: [], zxcvbn: { score: 4, required: 3 } })),
            getPolicy: jest.fn(),
            getPublicPolicy: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get<UsersService>(UsersService);
    authService = module.get<AuthService>(AuthService);
    emailService = module.get<EmailService>(EmailService);
    ssoService = module.get<SSOService>(SSOService);
    settingRepository = module.get(getRepositoryToken(Setting));
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUserById', () => {
    it('should return a user by ID', async () => {
      const user = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
        systemPermissions: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        resourceIntroductions: [],
        resourceUsages: [],
        authenticationDetails: [],
        resourceIntroducerPermissions: [],
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

  describe('createUser', () => {
    it('should create a new user', async () => {
      settingRepository.findOne.mockResolvedValue({ value: '*' });
      const user = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        isEmailVerified: false,
        emailVerificationToken: 'token',
        emailVerificationTokenExpiresAt: new Date(),
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
        systemPermissions: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        resourceIntroductions: [],
        resourceUsages: [],
        authenticationDetails: [],
        resourceIntroducerPermissions: [],
      } as User;

      jest.spyOn(usersService, 'createOne').mockResolvedValue(user);
      jest.spyOn(authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(authService, 'addAuthenticationDetails').mockResolvedValue({
        id: 1,
        userId: 1,
        type: AuthenticationType.LOCAL_PASSWORD,
        password: 'hashed-password',
        user: {} as User,
      });

      const createUserDto: CreateUserDto = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      };

      const response = await controller.createOne(createUserDto);
      expect(response).toEqual(user);
      expect(authService.addAuthenticationDetails).toHaveBeenCalledWith(user.id, {
        type: AuthenticationType.LOCAL_PASSWORD,
        details: {
          password: createUserDto.password,
        },
      });
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(user, 'verification-token');
    });

    it('should throw if email domain is not whitelisted', async () => {
      settingRepository.findOne.mockResolvedValue({ value: 'example.com, allowed.com' });

      const createUserDto: CreateUserDto = {
        username: 'testuser',
        email: 'notallowed@bar.com',
        password: 'password',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      };

      await expect(controller.createOne(createUserDto)).rejects.toBeInstanceOf(ForbiddenSignupDomainException);
    });

    it('should allow when email domain is whitelisted', async () => {
      settingRepository.findOne.mockResolvedValue({ value: 'allowed.com' });
      const user = {
        id: 2,
        username: 'alice',
        email: 'alice@allowed.com',
        systemPermissions: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        resourceIntroductions: [],
        resourceUsages: [],
        authenticationDetails: [],
        resourceIntroducerPermissions: [],
      } as User;

      jest.spyOn(usersService, 'createOne').mockResolvedValue(user);
      jest.spyOn(authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(authService, 'addAuthenticationDetails').mockResolvedValue({
        id: 2,
        userId: 2,
        type: AuthenticationType.LOCAL_PASSWORD,
        password: 'hashed',
        user: {} as User,
      });

      const dto: CreateUserDto = {
        username: 'alice',
        email: 'alice@allowed.com',
        password: 'password',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      };

      const response = await controller.createOne(dto);
      expect(response).toEqual(user);
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(user, 'verification-token');
    });
  });

  describe('parseCsvFile', () => {
    const buildConfig = (overrides?: Partial<CsvInviteConfigDto>): CsvInviteConfigDto => ({
      emailKey: 'email',
      usernameKey: 'username',
      permissions: {
        canManageResources: { keyMapping: 'perm', yesValue: 'true' },
        canManageSystemConfiguration: { keyMapping: 'perm', yesValue: 'true' },
        canManageUsers: { keyMapping: 'perm', yesValue: 'true' },
        canManageBilling: { keyMapping: 'perm', yesValue: 'true' },
      },
      ...overrides,
    });

    it('parses quoted values and honors ignored rows', async () => {
      const csv = 'email,username,perm\n"john@example.com","user1","tr,ue"\nsecond@example.com,user2,tr,ue\n';
      const file: FileUpload = { buffer: Buffer.from(csv) } as FileUpload;
      const config = buildConfig({
        permissions: {
          canManageResources: { keyMapping: 'perm', yesValue: 'true' },
          canManageSystemConfiguration: { keyMapping: 'perm', yesValue: 'true' },
          canManageUsers: { keyMapping: 'perm', yesValue: 'tr,ue' },
          canManageBilling: { keyMapping: 'perm', yesValue: 'true' },
        },
        ignoredRows: [2],
      });

      const result = await controller.parseCsvFile(file, config);

      expect(result.errors).toEqual([]);
      expect(result.candidates).toEqual([
        {
          email: 'john@example.com',
          username: 'user1',
          systemPermissions: { canManageUsers: true },
          row: 1,
        },
      ]);
    });

    it('throws for missing header row', async () => {
      const file: FileUpload = { buffer: Buffer.from('\n\n') } as FileUpload;
      const config = buildConfig();

      await expect(controller.parseCsvFile(file, config)).rejects.toThrow('MISSING_HEADER_ROW');
    });

    it('records duplicate email errors', async () => {
      const csv = 'email,username\nfirst@example.com,user1\nfirst@example.com,user2\n';
      const file: FileUpload = { buffer: Buffer.from(csv) } as FileUpload;
      const config = buildConfig();

      const result = await controller.parseCsvFile(file, config);

      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ row: 2, field: 'email', message: 'DUPLICATE_IN_CSV' })]),
      );
    });
  });

  describe('local signup domain whitelist endpoints', () => {
    it('getLocalSignupDomainWhitelist should return default "*" when missing', async () => {
      settingRepository.findOne.mockResolvedValue(null);
      const result = await controller.getLocalSignupDomainWhitelist();
      expect(result).toEqual(['*']);
    });

    it('getLocalSignupDomainWhitelist should parse and normalize domains', async () => {
      settingRepository.findOne.mockResolvedValue({ value: ' Example.COM ,allowed.org,  ,Another.Net ' });
      const result = await controller.getLocalSignupDomainWhitelist();
      expect(result).toEqual(['example.com', 'allowed.org', 'another.net']);
    });

    it('setLocalSignupDomainWhitelist should update repository with joined list', async () => {
      await controller.setLocalSignupDomainWhitelist(['example.com', 'allowed.org']);
      expect(settingRepository.update).toHaveBeenCalledWith(
        { parent: 'auth', key: 'local_signup_domain_whitelist' },
        { value: 'example.com,allowed.org' },
      );
    });

    it('isLocalSignupEnabled should return false when list is empty', async () => {
      settingRepository.findOne.mockResolvedValue({ value: '' });
      const result = await controller.isLocalSignupEnabled();
      expect(result).toEqual({ value: false });
    });

    it('isLocalSignupEnabled should return true when list has any value', async () => {
      settingRepository.findOne.mockResolvedValue({ value: '*' });
      const result = await controller.isLocalSignupEnabled();
      expect(result).toEqual({ value: true });
    });
  });

  describe('permission updates with SSO mappings', () => {
    const requestUser = {
      id: 99,
      systemPermissions: {
        canManageResources: true,
        canManageSystemConfiguration: true,
        canManageUsers: true,
        canManageBilling: true,
      },
    } as User;

    describe('updatePermissions', () => {
      it('allows updating non-SSO-mapped permissions when only some permissions have SSO mappings', async () => {
        const targetUser = {
          id: 1,
          systemPermissions: {
            canManageResources: false,
            canManageSystemConfiguration: false,
            canManageUsers: false,
            canManageBilling: false,
          },
          authenticationDetails: [
            { type: AuthenticationType.SSO, providerType: SSOProviderType.OIDC, providerId: 42 },
          ],
        } as User;

        jest.spyOn(usersService, 'findOne').mockResolvedValue(targetUser);
        jest.spyOn(usersService, 'updateOne').mockResolvedValue(targetUser);
        // Only canManageUsers is SSO-managed; canManageResources is not
        jest.spyOn(ssoService, 'getProviderByTypeAndIdWithConfiguration').mockResolvedValue({
          oidcConfiguration: { permissionMappings: { canManageUsers: ['admins'] } },
        } as never);

        await controller.updatePermissions(
          targetUser.id,
          { canManageResources: true },
          { user: requestUser } as AuthenticatedRequest,
        );

        expect(usersService.updateOne).toHaveBeenCalledWith(
          targetUser.id,
          expect.objectContaining({
            systemPermissions: expect.objectContaining({ canManageResources: true }),
          }),
        );
      });

      it('silently skips SSO-mapped permissions included in the request body', async () => {
        const targetUser = {
          id: 1,
          systemPermissions: {
            canManageResources: false,
            canManageSystemConfiguration: false,
            canManageUsers: false,
            canManageBilling: false,
          },
          authenticationDetails: [
            { type: AuthenticationType.SSO, providerType: SSOProviderType.OIDC, providerId: 42 },
          ],
        } as User;

        jest.spyOn(usersService, 'findOne').mockResolvedValue(targetUser);
        jest.spyOn(usersService, 'updateOne').mockResolvedValue(targetUser);
        // canManageResources is SSO-managed; canManageSystemConfiguration is not
        jest.spyOn(ssoService, 'getProviderByTypeAndIdWithConfiguration').mockResolvedValue({
          oidcConfiguration: { permissionMappings: { canManageResources: ['resource-admins'] } },
        } as never);

        await controller.updatePermissions(
          targetUser.id,
          { canManageResources: true, canManageSystemConfiguration: true },
          { user: requestUser } as AuthenticatedRequest,
        );

        const savedPermissions = (usersService.updateOne as jest.Mock).mock.calls[0][1].systemPermissions;
        expect(savedPermissions.canManageResources).toBe(false);        // SSO-managed: not changed
        expect(savedPermissions.canManageSystemConfiguration).toBe(true); // not SSO-managed: applied
      });

      it('applies full update when user has no SSO permission mappings', async () => {
        const targetUser = {
          id: 1,
          systemPermissions: {
            canManageResources: false,
            canManageSystemConfiguration: false,
            canManageUsers: false,
            canManageBilling: false,
          },
          authenticationDetails: [],
        } as User;

        jest.spyOn(usersService, 'findOne').mockResolvedValue(targetUser);
        jest.spyOn(usersService, 'updateOne').mockResolvedValue(targetUser);

        await controller.updatePermissions(
          targetUser.id,
          { canManageResources: true, canManageUsers: true },
          { user: requestUser } as AuthenticatedRequest,
        );

        expect(usersService.updateOne).toHaveBeenCalledWith(
          targetUser.id,
          expect.objectContaining({
            systemPermissions: expect.objectContaining({
              canManageResources: true,
              canManageUsers: true,
            }),
          }),
        );
      });

      it('saves canManageBilling when included in the request', async () => {
        const targetUser = {
          id: 1,
          systemPermissions: {
            canManageResources: true,
            canManageSystemConfiguration: true,
            canManageUsers: true,
            canManageBilling: true,
          },
          authenticationDetails: [],
        } as User;

        jest.spyOn(usersService, 'findOne').mockResolvedValue(targetUser);
        jest.spyOn(usersService, 'updateOne').mockResolvedValue(targetUser);

        await controller.updatePermissions(
          targetUser.id,
          { canManageResources: true, canManageSystemConfiguration: true, canManageUsers: true, canManageBilling: false },
          { user: requestUser } as AuthenticatedRequest,
        );

        expect(usersService.updateOne).toHaveBeenCalledWith(
          targetUser.id,
          expect.objectContaining({
            systemPermissions: expect.objectContaining({ canManageBilling: false }),
          }),
        );
      });

      /**
       * Regression guard: every key on SystemPermissions must round-trip through
       * updatePermissions.  If a new permission is added to the entity but
       * forgotten in UpdateUserPermissionsDto or the controller handler, this
       * test will fail because the saved value will still reflect the original
       * (all-true) state instead of the requested (all-false) state.
       */
      it('persists every SystemPermissions field — regression guard for missing DTO/handler entries', async () => {
        const allTrue: SystemPermissions = {
          canManageResources: true,
          canManageSystemConfiguration: true,
          canManageUsers: true,
          canManageBilling: true,
        };

        const targetUser = {
          id: 1,
          systemPermissions: { ...allTrue },
          authenticationDetails: [],
        } as User;

        jest.spyOn(usersService, 'findOne').mockResolvedValue(targetUser);
        jest.spyOn(usersService, 'updateOne').mockResolvedValue(targetUser);

        // Build a request that turns every permission off
        const allFalse = Object.fromEntries(
          (Object.keys(allTrue) as Array<keyof SystemPermissions>).map((k) => [k, false]),
        ) as Record<keyof SystemPermissions, boolean>;

        await controller.updatePermissions(
          targetUser.id,
          allFalse,
          { user: requestUser } as AuthenticatedRequest,
        );

        const saved = (usersService.updateOne as jest.Mock).mock.calls[0][1].systemPermissions;

        for (const key of Object.keys(allTrue) as Array<keyof SystemPermissions>) {
          expect(saved[key]).toBe(false); // if this fails, the field is missing from the DTO or controller
        }
      });

      it('does not apply any changes when all requested permissions are SSO-managed', async () => {
        const targetUser = {
          id: 1,
          systemPermissions: {
            canManageResources: false,
            canManageSystemConfiguration: false,
            canManageUsers: false,
            canManageBilling: false,
          },
          authenticationDetails: [
            { type: AuthenticationType.SSO, providerType: SSOProviderType.OIDC, providerId: 42 },
          ],
        } as User;

        jest.spyOn(usersService, 'findOne').mockResolvedValue(targetUser);
        jest.spyOn(usersService, 'updateOne').mockResolvedValue(targetUser);
        // All three dto-level permissions are SSO-managed
        jest.spyOn(ssoService, 'getProviderByTypeAndIdWithConfiguration').mockResolvedValue({
          oidcConfiguration: {
            permissionMappings: {
              canManageResources: ['r'],
              canManageUsers: ['u'],
              canManageSystemConfiguration: ['s'],
            },
          },
        } as never);

        await controller.updatePermissions(
          targetUser.id,
          { canManageResources: true, canManageUsers: true, canManageSystemConfiguration: true },
          { user: requestUser } as AuthenticatedRequest,
        );

        const savedPermissions = (usersService.updateOne as jest.Mock).mock.calls[0][1].systemPermissions;
        expect(savedPermissions.canManageResources).toBe(false);
        expect(savedPermissions.canManageUsers).toBe(false);
        expect(savedPermissions.canManageSystemConfiguration).toBe(false);
      });
    });

    describe('bulkUpdatePermissions', () => {
      it('applies only non-SSO-managed permissions for SSO users in bulk update', async () => {
        const ssoUser = {
          id: 2,
          systemPermissions: {
            canManageResources: false,
            canManageSystemConfiguration: false,
            canManageUsers: false,
            canManageBilling: false,
          },
          authenticationDetails: [
            { type: AuthenticationType.SSO, providerType: SSOProviderType.OIDC, providerId: 7 },
          ],
        } as User;
        const normalUser = {
          id: 3,
          systemPermissions: {
            canManageResources: false,
            canManageSystemConfiguration: false,
            canManageUsers: false,
            canManageBilling: false,
          },
          authenticationDetails: [],
        } as User;

        jest
          .spyOn(usersService, 'findOne')
          .mockImplementation(({ id }) => Promise.resolve(id === 2 ? ssoUser : id === 3 ? normalUser : null));
        jest
          .spyOn(usersService, 'updateOne')
          .mockImplementation(async (id) => (id === ssoUser.id ? ssoUser : normalUser));
        // canManageResources is SSO-managed for the SSO user; canManageSystemConfiguration is not
        jest.spyOn(ssoService, 'getProviderByTypeAndIdWithConfiguration').mockResolvedValue({
          oidcConfiguration: { permissionMappings: { canManageResources: ['resource-admins'] } },
        } as never);

        await controller.bulkUpdatePermissions(
          {
            updates: [
              { userId: ssoUser.id, permissions: { canManageResources: true, canManageSystemConfiguration: true } },
              { userId: normalUser.id, permissions: { canManageResources: true } },
            ],
          },
          { user: requestUser } as AuthenticatedRequest,
        );

        const ssoCall = (usersService.updateOne as jest.Mock).mock.calls.find(([id]) => id === ssoUser.id);
        expect(ssoCall).toBeDefined();
        expect(ssoCall[1].systemPermissions.canManageResources).toBe(false);        // SSO-managed: not changed
        expect(ssoCall[1].systemPermissions.canManageSystemConfiguration).toBe(true); // not SSO-managed: applied

        const normalCall = (usersService.updateOne as jest.Mock).mock.calls.find(([id]) => id === normalUser.id);
        expect(normalCall).toBeDefined();
        expect(normalCall[1].systemPermissions.canManageResources).toBe(true);
      });

      it('includes SSO users in bulk result when their update contains non-SSO-managed permissions', async () => {
        const ssoUser = {
          id: 2,
          systemPermissions: {
            canManageResources: false,
            canManageSystemConfiguration: false,
            canManageUsers: false,
            canManageBilling: false,
          },
          authenticationDetails: [
            { type: AuthenticationType.SSO, providerType: SSOProviderType.OIDC, providerId: 7 },
          ],
        } as User;
        const normalUser = {
          id: 3,
          systemPermissions: {
            canManageResources: false,
            canManageSystemConfiguration: false,
            canManageUsers: false,
            canManageBilling: false,
          },
          authenticationDetails: [],
        } as User;

        jest
          .spyOn(usersService, 'findOne')
          .mockImplementation(({ id }) => Promise.resolve(id === 2 ? ssoUser : id === 3 ? normalUser : null));
        jest
          .spyOn(usersService, 'updateOne')
          .mockImplementation(async (id) => (id === ssoUser.id ? ssoUser : normalUser));
        jest.spyOn(ssoService, 'getProviderByTypeAndIdWithConfiguration').mockResolvedValue({
          oidcConfiguration: { permissionMappings: { canManageResources: ['admins'] } },
        } as never);

        const result = await controller.bulkUpdatePermissions(
          {
            updates: [
              { userId: ssoUser.id, permissions: { canManageSystemConfiguration: true } }, // not SSO-managed
              { userId: normalUser.id, permissions: { canManageResources: true } },
            ],
          },
          { user: requestUser } as AuthenticatedRequest,
        );

        expect(result).toHaveLength(2);
        expect(usersService.updateOne).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('createOneUser with overwriteFirstTimeAdmin', () => {
    const unverifiedAdmin = {
      id: 1,
      username: 'admin',
      email: 'wrong@example.com',
      isEmailVerified: false,
      emailVerificationToken: 'token',
      emailVerificationTokenExpiresAt: new Date(),
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null,
      systemPermissions: {
        canManageResources: true,
        canManageSystemConfiguration: true,
        canManageUsers: true,
        canManageBilling: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      resourceIntroductions: [],
      resourceUsages: [],
      authenticationDetails: [],
      resourceIntroducerPermissions: [],
    } as User;

    const newAdmin = { ...unverifiedAdmin, id: 2, email: 'correct@example.com' } as User;

    const dto: CreateUserDto & { overwriteFirstTimeAdmin: true } = {
      username: 'admin',
      email: 'correct@example.com',
      password: 'password123',
      strategy: AuthenticationType.LOCAL_PASSWORD,
      overwriteFirstTimeAdmin: true,
    };

    beforeEach(() => {
      settingRepository.findOne.mockResolvedValue({ value: '*' });
    });

    it('deletes the existing unverified admin and creates a fresh one', async () => {
      jest.spyOn(usersService, 'countUsers').mockResolvedValue(1);
      jest
        .spyOn(usersService, 'findMany')
        .mockResolvedValue({ data: [unverifiedAdmin], total: 1, page: 1, limit: 1 });
      jest.spyOn(usersService, 'deleteOne').mockResolvedValue(undefined);
      jest.spyOn(usersService, 'createOne').mockResolvedValue(newAdmin);
      jest.spyOn(authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(authService, 'addAuthenticationDetails').mockResolvedValue({
        id: 1,
        userId: newAdmin.id,
        type: AuthenticationType.LOCAL_PASSWORD,
        password: 'hashed',
        user: {} as User,
      });

      const result = await controller.createOne(dto);

      expect(usersService.deleteOne).toHaveBeenCalledWith(unverifiedAdmin.id);
      expect(usersService.createOne).toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(newAdmin, 'verification-token');
      expect(result).toEqual(newAdmin);
    });

    it('throws ForbiddenException when total users is not exactly 1', async () => {
      jest.spyOn(usersService, 'countUsers').mockResolvedValue(2);

      await expect(controller.createOne(dto)).rejects.toThrow(ForbiddenException);
      expect(usersService.deleteOne).not.toHaveBeenCalled();
      expect(usersService.createOne).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when no users exist', async () => {
      jest.spyOn(usersService, 'countUsers').mockResolvedValue(0);

      await expect(controller.createOne(dto)).rejects.toThrow(ForbiddenException);
      expect(usersService.deleteOne).not.toHaveBeenCalled();
      expect(usersService.createOne).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the single existing user has a verified email', async () => {
      const verified = { ...unverifiedAdmin, isEmailVerified: true } as User;
      jest.spyOn(usersService, 'countUsers').mockResolvedValue(1);
      jest
        .spyOn(usersService, 'findMany')
        .mockResolvedValue({ data: [verified], total: 1, page: 1, limit: 1 });

      await expect(controller.createOne(dto)).rejects.toThrow(ForbiddenException);
      expect(usersService.deleteOne).not.toHaveBeenCalled();
      expect(usersService.createOne).not.toHaveBeenCalled();
    });

    it('checks the first-time-setup invariant BEFORE touching credentials (no user enumeration)', async () => {
      const callOrder: string[] = [];
      jest.spyOn(usersService, 'countUsers').mockImplementation(async () => {
        callOrder.push('countUsers');
        return 2;
      });
      const findOneSpy = jest.spyOn(usersService, 'findOne').mockImplementation(async () => {
        callOrder.push('findOne');
        return unverifiedAdmin;
      });

      await expect(controller.createOne(dto)).rejects.toThrow(ForbiddenException);

      expect(callOrder[0]).toBe('countUsers');
      expect(findOneSpy).not.toHaveBeenCalled();
    });

    it('ignores the overwrite flag when not set (normal create flow)', async () => {
      jest.spyOn(usersService, 'countUsers').mockResolvedValue(5);
      jest.spyOn(usersService, 'createOne').mockResolvedValue(newAdmin);
      jest.spyOn(authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(authService, 'addAuthenticationDetails').mockResolvedValue({
        id: 1,
        userId: newAdmin.id,
        type: AuthenticationType.LOCAL_PASSWORD,
        password: 'hashed',
        user: {} as User,
      });

      const regularDto: CreateUserDto = {
        username: 'someone',
        email: 'someone@example.com',
        password: 'password123',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      };

      await controller.createOne(regularDto);

      expect(usersService.deleteOne).not.toHaveBeenCalled();
      expect(usersService.countUsers).not.toHaveBeenCalled();
    });
  });
});
