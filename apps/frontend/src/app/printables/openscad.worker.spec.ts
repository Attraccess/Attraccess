import { describe, expect, it } from 'vitest';
import { assertionMessage } from './openscad.worker';

describe('assertionMessage', () => {
  it('extracts a clean message from a real OpenSCAD assert() failure, despite embedded quotes', () => {
    // Genuine stderr line for a label that doesn't fit: the message (built with `str(...)` in
    // nfc-keychain-card.scad) itself quotes the label, so it contains two embedded, unescaped
    // quote characters in addition to the pair OpenSCAD wraps around the whole message.
    const line =
      'ERROR: Assertion \'(!HAS_LABEL || (LABEL_SIZE >= (LABEL_CAP_MIN / CAP_RATIO)))\' failed: ' +
      '"Label too long: "THIS LABEL IS ... LONG" does not fit in 54 mm at the minimum 3 mm cap height." ' +
      'in file /card.scad, line 69';

    expect(assertionMessage([line])).toBe(
      'Label too long: "THIS LABEL IS ... LONG" does not fit in 54 mm at the minimum 3 mm cap height.'
    );
  });

  it('returns null when no stderr line reports an assertion failure', () => {
    expect(assertionMessage(['ECHO: some unrelated diagnostic'])).toBeNull();
  });
});
