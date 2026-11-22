import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { instanceToPlain } from 'class-transformer';
import { AUTH_RATE_LIMIT_METADATA, AUTH_RATE_LIMIT_OPTIONS_METADATA } from '../rate-limiting/rate-limit.decorator';
import { UserProfileController } from './user-profile.controller';
import { toUserAccountDto } from './dtos/user.dto';
import { aUserRecord } from './fakes/in-memory-user-store.test-fixture';

describe('UserProfileController', () => {
  it('accepts account deletion confirmation via POST only', () => {
    const handler = UserProfileController.prototype.confirmDeleteAccount;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('me/delete-confirm');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    const prototype = UserProfileController.prototype as unknown as Record<string, object>;
    const confirmRoutes = Object.getOwnPropertyNames(prototype)
      .filter(
        (name) => name !== 'constructor' && Reflect.getMetadata(PATH_METADATA, prototype[name]) === 'me/delete-confirm',
      )
      .map((name) => Reflect.getMetadata(METHOD_METADATA, prototype[name]));
    expect(confirmRoutes).toEqual([RequestMethod.POST]);
  });

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
      'firstName',
      'id',
      'isEmailVerified',
      'lastName',
      'locale',
      'updatedAt',
      'username',
    ]);
    // another user's record never maps its email
    expect(toUserAccountDto(aUserRecord({ email: 'other@example.com' }))).not.toHaveProperty('email');
  });
});
