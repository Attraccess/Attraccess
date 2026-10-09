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

  it('returns persisted canonical preferences for the authenticated user', async () => {
    const updateDateTimePreferences = jest.fn().mockResolvedValue({ dateTimeLocale: 'en-GB' });
    const controller = new UserProfileController({ updateDateTimePreferences } as never);
    const request = { user: { id: 42, locale: 'de', dateTimeLocale: null } } as never;
    const response = await controller.updateMyDateTimePreferences(request, { dateTimeLocale: ' en-gb ' });
    expect(updateDateTimePreferences).toHaveBeenCalledWith(42, { dateTimeLocale: ' en-gb ' });
    expect(response).toMatchObject({ dateTimeLocale: 'en-GB', locale: 'de' });
    updateDateTimePreferences.mockResolvedValue({ dateTimeLocale: null });
    expect(await controller.updateMyDateTimePreferences(request, { dateTimeLocale: null })).toMatchObject({
      dateTimeLocale: null,
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
        dateTimeLocale: 'en-GB',
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

    expect(instanceToPlain(currentUser)).toMatchObject({ email: 'me@example.com', dateTimeLocale: 'en-GB' });
    expect(Object.keys(currentUser).sort()).toEqual([
      'billingFactor',
      'createdAt',
      'creditBalance',
      'dateTimeLocale',
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
