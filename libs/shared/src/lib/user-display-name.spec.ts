import { formatUserDisplayName, hasUserName } from './user-display-name';

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
