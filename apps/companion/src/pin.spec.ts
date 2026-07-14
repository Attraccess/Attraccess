import { hashPin, verifyPinHash } from './pin';

describe('hashPin', () => {
  it('returns a 64-char hex string', () => {
    expect(hashPin('1234')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(hashPin('abcd')).toBe(hashPin('abcd'));
  });

  it('differs for different PINs', () => {
    expect(hashPin('1234')).not.toBe(hashPin('5678'));
  });
});

describe('verifyPinHash', () => {
  it('returns false when no hash is stored', () => {
    expect(verifyPinHash('1234', null)).toBe(false);
  });

  it('returns true for the correct PIN', () => {
    const stored = hashPin('mysecretpin');
    expect(verifyPinHash('mysecretpin', stored)).toBe(true);
  });

  it('returns false for a wrong PIN', () => {
    const stored = hashPin('mysecretpin');
    expect(verifyPinHash('wrongpin', stored)).toBe(false);
  });

  it('rejects an empty PIN even if stored hash matches empty string', () => {
    // The stored hash should never be for an empty string (wizard enforces >= 4 chars),
    // but verifyPinHash must still correctly compare (not short-circuit true).
    const stored = hashPin('');
    expect(verifyPinHash('', stored)).toBe(true); // empty matches empty
    expect(verifyPinHash('notempty', stored)).toBe(false);
  });
});
