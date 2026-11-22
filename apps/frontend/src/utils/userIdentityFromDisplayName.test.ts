import { formatUserDisplayName } from '@attraccess/shared';
import { userIdentityFromDisplayName } from './userIdentityFromDisplayName';

describe('userIdentityFromDisplayName', () => {
  it('splits the display name at its first whitespace into first and last name', () => {
    expect(userIdentityFromDisplayName({ id: 1, username: 'ada', displayName: 'Ada Lovelace' })).toEqual({
      id: 1,
      username: 'ada',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    expect(userIdentityFromDisplayName({ id: 1, username: 'ada', displayName: 'Ada King Lovelace' })).toMatchObject({
      firstName: 'Ada',
      lastName: 'King Lovelace',
    });
  });

  it('keeps a single-word display name as the first name', () => {
    expect(userIdentityFromDisplayName({ id: 1, username: 'ada', displayName: 'Ada' })).toMatchObject({
      firstName: 'Ada',
      lastName: null,
    });
  });

  it('gives back the same display name', () => {
    for (const displayName of ['Ada Lovelace', 'Ada King Lovelace', 'Ada', 'Mary  Ann']) {
      expect(formatUserDisplayName(userIdentityFromDisplayName({ id: 1, username: 'ada', displayName }))).toBe(
        displayName,
      );
    }
  });

  it('sets no name when the display name is the username or missing', () => {
    expect(userIdentityFromDisplayName({ id: 1, username: 'ada', displayName: 'ada' }).firstName).toBeNull();
    expect(userIdentityFromDisplayName({ id: 1, username: 'ada' }).firstName).toBeNull();
  });
});
