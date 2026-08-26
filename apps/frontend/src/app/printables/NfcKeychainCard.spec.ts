import { describe, expect, it } from 'vitest';
import { resolveErrorMessage } from './NfcKeychainCard';
import { NO_OUTPUT_ERROR } from './errors';

describe('resolveErrorMessage', () => {
  it('passes null through unchanged', () => {
    expect(resolveErrorMessage(null, (key) => key)).toBeNull();
  });

  it('maps the no-output sentinel to the translated string, not the raw reason code', () => {
    const t = (key: string) => (key === 'errorNoOutput' ? 'translated no-output message' : `!!! ${key} !!!`);
    expect(resolveErrorMessage(NO_OUTPUT_ERROR, t)).toBe('translated no-output message');
  });

  it("surfaces any other error (OpenSCAD's own English assert() message) untranslated", () => {
    const t = (key: string) => `!!! ${key} !!!`;
    const assertMessage = 'Label too long: "X" does not fit in 54 mm at the minimum 3 mm cap height.';
    expect(resolveErrorMessage(assertMessage, t)).toBe(assertMessage);
  });
});
