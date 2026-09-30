import { User } from '@attraccess/database-entities';
import { instanceToPlain } from 'class-transformer';
import { AUTH_RATE_LIMIT_METADATA, AUTH_RATE_LIMIT_OPTIONS_METADATA } from '../rate-limiting/rate-limit.decorator';
import { UserProfileController } from './user-profile.controller';

describe('UserProfileController', () => {
  it('rate limits account deletion confirmation requests', () => {
    expect(Reflect.getMetadata(AUTH_RATE_LIMIT_METADATA, UserProfileController.prototype.confirmDeleteAccount)).toBe(
      'delete_account_confirm',
    );
    expect(
      Reflect.getMetadata(AUTH_RATE_LIMIT_OPTIONS_METADATA, UserProfileController.prototype.confirmDeleteAccount),
    ).toEqual({
      clearFailuresOnSuccess: false,
    });
  });

  it('includes email only in the current user response', async () => {
    const controller = new UserProfileController({} as never);
    const currentUser = await controller.getCurrent({
      user: {
        id: 1,
        username: 'me',
        email: 'me@example.com',
        locale: 'en',
        isEmailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        externalIdentifier: null,
        creditBalance: 0,
        billingFactor: 100,
        effectivePermissions: [],
        deleteAccountToken: 'secret',
      },
    } as never);
    const adminUser = Object.assign(new User(), { email: 'other@example.com' });

    expect(instanceToPlain(currentUser)).toMatchObject({ email: 'me@example.com' });
    expect(Object.keys(currentUser).sort()).toEqual([
      'billingFactor',
      'createdAt',
      'creditBalance',
      'deletedAt',
      'effectivePermissions',
      'email',
      'externalIdentifier',
      'id',
      'isEmailVerified',
      'locale',
      'updatedAt',
      'username',
    ]);
    expect(instanceToPlain(adminUser)).not.toHaveProperty('email');
  });
});
