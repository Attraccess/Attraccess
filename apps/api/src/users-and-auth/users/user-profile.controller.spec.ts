import { AUTH_RATE_LIMIT_METADATA } from '../rate-limiting/rate-limit.decorator';
import { UserProfileController } from './user-profile.controller';

describe('UserProfileController', () => {
  it('rate limits account deletion confirmation requests', () => {
    expect(Reflect.getMetadata(AUTH_RATE_LIMIT_METADATA, UserProfileController.prototype.confirmDeleteAccount)).toBe(
      'delete_account_confirm',
    );
  });
});
