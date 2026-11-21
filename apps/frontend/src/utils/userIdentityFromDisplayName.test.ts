import { userIdentityFromDisplayName } from './userIdentityFromDisplayName';

describe('userIdentityFromDisplayName', () => {
  it('uses the display name as the name when it differs from the username', () => {
    expect(userIdentityFromDisplayName({ id: 1, username: 'ada', displayName: 'Ada Lovelace' })).toEqual({
      id: 1,
      username: 'ada',
      firstName: 'Ada Lovelace',
      lastName: null,
    });
  });

  it('sets no name when the display name is the username or missing', () => {
    expect(userIdentityFromDisplayName({ id: 1, username: 'ada', displayName: 'ada' }).firstName).toBeNull();
    expect(userIdentityFromDisplayName({ id: 1, username: 'ada' }).firstName).toBeNull();
  });
});
