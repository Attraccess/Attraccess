import { describe, expect, it } from 'vitest';
import { dependencyError } from './dependencyError';

describe('dependencyError', () => {
  it('returns null without an error', () => {
    expect(dependencyError(null)).toBeNull();
  });

  it('prefers the API response message', () => {
    expect(dependencyError({ body: { message: 'Conflict' }, message: 'ignored' })).toBe('Conflict');
  });

  it('falls back to the error message, then to a string', () => {
    expect(dependencyError(new Error('Network down'))).toBe('Network down');
    expect(dependencyError('plain')).toBe('plain');
  });
});
