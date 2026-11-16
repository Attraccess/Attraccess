import { describe, expect, it } from 'vitest';
import { formatDuration } from './time';

describe('formatDuration', () => {
  it('uses the units of the given language', () => {
    expect(formatDuration(15, 'en')).toBe('15 min');
    expect(formatDuration(90, 'en')).toBe('1 hr 30 min');
    expect(formatDuration(120, 'de')).toBe('2 Std.');
    expect(formatDuration(15, 'de')).toBe('15 Min.');
  });
});
