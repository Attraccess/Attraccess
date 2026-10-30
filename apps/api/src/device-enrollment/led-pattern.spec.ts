import { LED_PATTERN_COUNT, canonicalLedPattern, isValidLedPattern, pickLedPattern } from './led-pattern';

describe('led-pattern', () => {
  it('has 120 distinct patterns', () => {
    expect(LED_PATTERN_COUNT).toBe(120);
  });

  it('treats rotated and mirrored patterns as equal', () => {
    const base = ['red', 'green', 'blue', 'yellow'];
    expect(canonicalLedPattern(['green', 'blue', 'yellow', 'red'])).toBe(canonicalLedPattern(base));
    expect(canonicalLedPattern(['yellow', 'blue', 'green', 'red'])).toBe(canonicalLedPattern(base));
    expect(canonicalLedPattern(['red', 'green', 'blue', 'magenta'])).not.toBe(canonicalLedPattern(base));
  });

  it('rejects neighbouring repeats including last next to first', () => {
    expect(isValidLedPattern(['red', 'green', 'red', 'green'])).toBe(true);
    expect(isValidLedPattern(['red', 'red', 'green', 'blue'])).toBe(false);
    expect(isValidLedPattern(['red', 'green', 'blue', 'red'])).toBe(false);
    expect(isValidLedPattern(['red', 'green', 'blue'])).toBe(false);
    expect(isValidLedPattern(['red', 'green', 'blue', 'orange'])).toBe(false);
  });

  it('only picks valid free patterns and returns null once all 120 are taken', () => {
    const taken = new Set<string>();
    for (let i = 0; i < LED_PATTERN_COUNT; i++) {
      const pattern = pickLedPattern(taken);
      expect(pattern).not.toBeNull();
      expect(isValidLedPattern(pattern)).toBe(true);
      const key = canonicalLedPattern(pattern as string[]);
      expect(taken.has(key)).toBe(false);
      taken.add(key);
    }
    expect(pickLedPattern(taken)).toBeNull();
  });
});
