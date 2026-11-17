import { AuthenticationType, SSOProviderType, UserRoleSource } from '@attraccess/application-models';
import { aUserRecord } from './fakes/in-memory-user-store.test-fixture';
import { UserDto, toUserAccountDto } from './dtos/user.dto';
import { PaginatedUsersResponseDto } from './dtos/paginatedUsersResponse.dto';
import { CsvInviteSuccessResponseDto } from './dtos/csvInvite.dto';
import { UserInvitationsController } from './user-invitations.controller';
import { UserProfileController } from './user-profile.controller';
import { UsersAdminController } from './users-admin.controller';
import { UsersRegistrationController } from './users-registration.controller';

/** Every column a user row has that must never appear in a response. */
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

const PUBLIC_FIELDS = [
  'billingFactor',
  'createdAt',
  'creditBalance',
  'dateTimeLocale',
  'deletedAt',
  'externalIdentifier',
  'id',
  'isDisabled',
  'isEmailVerified',
  'locale',
  'updatedAt',
  'username',
];

const sensitiveUser = () =>
  aUserRecord({
    id: 5,
    username: 'target',
    email: 'private@example.com',
    emailVerificationToken: 'secret-verification',
    emailVerificationTokenExpiresAt: new Date(),
    passwordResetToken: 'secret-reset',
    passwordResetTokenExpiresAt: new Date(),
    lastUsernameChangeAt: new Date(),
    lockedUntil: new Date(),
    failedLoginAttempts: 4,
    firstFailedLoginAt: new Date(),
    deleteAccountToken: 'secret-delete',
    deleteAccountTokenExpiresAt: new Date(),
    deleteAccountRequestedAt: new Date(),
    nfcKeySeedToken: 'secret-seed',
  });

function expectPublicOnly(body: unknown) {
  const json = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  for (const field of PRIVATE_FIELDS) expect(json).not.toHaveProperty(field);
  expect(JSON.stringify(json)).not.toMatch(/private@example\.com|secret-/);
  return json;
}

describe('user responses', () => {
  describe('toUserAccountDto', () => {
    it('maps exactly the public fields of a user', () => {
      const json = expectPublicOnly(toUserAccountDto(sensitiveUser()));

      expect(Object.keys(json).sort()).toEqual([...PUBLIC_FIELDS].sort());
    });

    it('maps credentials without secrets and role assignments with their role', () => {
      const json = expectPublicOnly(
        toUserAccountDto({
          ...sensitiveUser(),
          authenticationDetails: [
            {
              id: 1,
              userId: 5,
              type: AuthenticationType.SSO,
              providerType: SSOProviderType.OIDC,
              providerId: 2,
              ssoSubject: 'subject',
              // a mapper that copied whole rows would leak these
              password: 'bcrypt-hash',
              totpSecret: 'totp-secret',
            } as never,
          ],
          userRoles: [
            {
              id: 3,
              userId: 5,
              roleId: 9,
              source: UserRoleSource.MANUAL,
              ssoProviderType: null,
              ssoProviderId: null,
              externalValue: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      ) as { authenticationDetails: Array<Record<string, unknown>>; userRoles: Array<Record<string, unknown>> };

      expect(Object.keys(json.authenticationDetails[0]).sort()).toEqual(
        ['id', 'providerId', 'providerType', 'ssoSubject', 'type', 'userId'].sort(),
      );
      expect(JSON.stringify(json)).not.toMatch(/bcrypt-hash|totp-secret/);
      expect(json.userRoles[0]).toMatchObject({ roleId: 9, source: UserRoleSource.MANUAL });
    });

    it('leaves relations out when they were not loaded', () => {
      const json = toUserAccountDto(sensitiveUser());

      expect(json).not.toHaveProperty('authenticationDetails');
      expect(json).not.toHaveProperty('userRoles');
    });
  });

  describe('endpoints', () => {
    const user = sensitiveUser();

    it('keep private fields out of every user-returning handler', async () => {
      const usersService = {
        changeUsername: jest.fn().mockResolvedValue(user),
        changeEmail: jest.fn().mockResolvedValue(user),
        updateLocale: jest.fn().mockResolvedValue(user),
      };
      const administration = {
        changeUsername: jest.fn().mockResolvedValue(user),
        changeEmail: jest.fn().mockResolvedValue(user),
        changeBillingFactor: jest.fn().mockResolvedValue(user),
      };
      const request = {
        user: { id: 5, locale: 'en', effectivePermissions: new Set(['users.update']) },
        ip: '::1',
        headers: {},
      };
      const profile = new UserProfileController(usersService as never);
      const admin = new UsersAdminController(usersService as never, administration as never);
      const registration = new UsersRegistrationController(
        {} as never,
        { createOne: jest.fn().mockResolvedValue(user), acceptInvitation: jest.fn().mockResolvedValue(user) } as never,
        {} as never,
      );
      const invitations = new UserInvitationsController({
        inviteUser: jest.fn().mockResolvedValue(user),
        inviteUsersFromCsv: jest.fn().mockResolvedValue([user, user]),
      } as never);

      const responses = [
        await profile.changeMyUsername(request as never, { username: 'next' }),
        await profile.changeMyEmail(request as never, { email: 'next@example.com' }),
        await profile.updateMyLocale(request as never, { locale: 'de' }),
        await admin.changeUserUsername(5, { username: 'next' }, request as never),
        await admin.changeUserEmail(5, { email: 'next@example.com' }, request as never),
        await admin.changeUserBillingFactor(5, { billingFactor: 50 }, request as never),
        await registration.createOne(
          {
            username: 'next',
            email: 'next@example.com',
            password: 'x',
            strategy: AuthenticationType.LOCAL_PASSWORD,
          } as never,
          { headers: {}, ip: '::1' } as never,
        ),
        await registration.acceptInvitation({ email: 'next@example.com', token: 't', password: 'x' } as never),
        await invitations.inviteUser(request as never, { username: 'next', email: 'next@example.com' }),
        await invitations.inviteUsersFromCsv(request as never, undefined, '{}'),
      ];

      expect(responses).toHaveLength(10);
      for (const response of responses) expectPublicOnly(response);
    });

    it('keep private fields out of the user listing, with and without role data', async () => {
      const usersService = {
        findMany: jest.fn().mockResolvedValue({ data: [user], total: 1, page: 1, limit: 10 }),
        findOne: jest.fn().mockResolvedValue(user),
      };
      const admin = new UsersAdminController(usersService as never, {} as never);
      const asReader = { user: { id: 1, effectivePermissions: new Set(['users.read']) } };

      const listing = await admin.findMany({ page: 1, limit: 10, includeRoles: true } as never, asReader as never);
      const single = await admin.getOneById(5, asReader as never);

      expectPublicOnly(listing);
      expectPublicOnly(single);
    });
  });

  describe('API contract', () => {
    const schemaName = (type: object) => {
      const [schema] = Reflect.getMetadata('swagger/apiSchema', type) ?? [];
      return schema?.name;
    };
    const responseType = (handler: object, status: number | string) =>
      Reflect.getMetadata('swagger/apiResponse', handler)?.[status]?.type;

    it('keeps the schema name User for the user shape', () => {
      expect(schemaName(UserDto)).toBe('User');
    });

    it.each([
      ['inviteUser', UserInvitationsController.prototype.inviteUser],
      ['inviteUsersFromCsv', UserInvitationsController.prototype.inviteUsersFromCsv],
      ['changeMyUsername', UserProfileController.prototype.changeMyUsername],
      ['changeMyEmail', UserProfileController.prototype.changeMyEmail],
      ['updateMyLocale', UserProfileController.prototype.updateMyLocale],
      ['getOneById', UsersAdminController.prototype.getOneById],
      ['changeUserUsername', UsersAdminController.prototype.changeUserUsername],
      ['changeUserEmail', UsersAdminController.prototype.changeUserEmail],
      ['changeUserBillingFactor', UsersAdminController.prototype.changeUserBillingFactor],
      ['createOne', UsersRegistrationController.prototype.createOne],
      ['acceptInvitation', UsersRegistrationController.prototype.acceptInvitation],
    ])('documents %s with the User schema', (_name, handler) => {
      expect(responseType(handler, 200) ?? responseType(handler, 201)).toBe(UserDto);
    });

    it.each([
      ['the paginated user list', PaginatedUsersResponseDto.prototype, 'data'],
      ['the CSV invitation result', CsvInviteSuccessResponseDto.prototype, 'users'],
    ])('documents %s with the User schema as well', (_name, prototype, property) => {
      expect(Reflect.getMetadata('swagger/apiModelProperties', prototype, property)).toMatchObject({
        type: UserDto,
        isArray: true,
      });
    });
  });
});
