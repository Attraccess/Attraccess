import { normalizeUserName } from './normalize-name';

describe('normalizeUserName', () => {
  it('trims and turns blanks into null', () => {
    expect(normalizeUserName('  Ada ')).toBe('Ada');
    expect(normalizeUserName('   ')).toBeNull();
    expect(normalizeUserName('')).toBeNull();
    expect(normalizeUserName(null)).toBeNull();
    expect(normalizeUserName(undefined)).toBeNull();
  });
});
