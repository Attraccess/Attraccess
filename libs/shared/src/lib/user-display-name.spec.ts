import { formatUserDisplayName, hasUserName, optionalUserDisplayName } from './user-display-name';

describe('formatUserDisplayName', () => {
  it('joins first and last name', () => {
    expect(formatUserDisplayName({ firstName: 'Ada', lastName: 'Lovelace', username: 'ada' })).toBe('Ada Lovelace');
  });

  it('shows only the first name', () => {
    expect(formatUserDisplayName({ firstName: 'Ada', lastName: null, username: 'ada' })).toBe('Ada');
  });

  it('shows only the last name', () => {
    expect(formatUserDisplayName({ firstName: null, lastName: 'Lovelace', username: 'ada' })).toBe('Lovelace');
  });

  it('falls back to the username without names', () => {
    expect(formatUserDisplayName({ firstName: null, lastName: null, username: 'ada' })).toBe('ada');
    expect(formatUserDisplayName({ username: 'ada' })).toBe('ada');
  });

  it('treats whitespace-only names as not set and trims the others', () => {
    expect(formatUserDisplayName({ firstName: '   ', lastName: '\t', username: 'ada' })).toBe('ada');
    expect(formatUserDisplayName({ firstName: '  Ada ', lastName: ' ', username: 'ada' })).toBe('Ada');
    expect(formatUserDisplayName({ firstName: ' Ada ', lastName: ' Lovelace ', username: 'ada' })).toBe('Ada Lovelace');
  });
});

describe('hasUserName', () => {
  it('is true when either part is set', () => {
    expect(hasUserName({ firstName: 'Ada', lastName: null })).toBe(true);
    expect(hasUserName({ firstName: ' ', lastName: 'L' })).toBe(true);
    expect(hasUserName({ firstName: ' ', lastName: undefined })).toBe(false);
  });
});

describe('optionalUserDisplayName', () => {
  it('formats a user like formatUserDisplayName', () => {
    expect(optionalUserDisplayName({ firstName: 'Ada', lastName: 'Lovelace', username: 'ada' })).toBe('Ada Lovelace');
    expect(optionalUserDisplayName({ firstName: ' ', lastName: null, username: 'ada' })).toBe('ada');
  });

  it('shows the name when the username is not loaded', () => {
    expect(optionalUserDisplayName({ firstName: 'Ada' })).toBe('Ada');
  });

  it('is undefined when neither a name nor a username is known', () => {
    expect(optionalUserDisplayName({ username: undefined })).toBeUndefined();
    expect(optionalUserDisplayName({ username: '', firstName: '  ' })).toBeUndefined();
    expect(optionalUserDisplayName(null)).toBeUndefined();
    expect(optionalUserDisplayName(undefined)).toBeUndefined();
  });
});
