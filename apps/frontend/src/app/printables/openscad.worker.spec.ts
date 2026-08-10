import { describe, expect, it } from 'vitest';
import { assertionMessage, renderErrorReason } from './openscad.worker';
import { NO_OUTPUT_ERROR } from './errors';

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

describe('renderErrorReason', () => {
  it('surfaces the assert() message as-is when OpenSCAD reports one', () => {
    const line =
      'ERROR: Assertion \'(!HAS_LABEL || (LABEL_SIZE >= (LABEL_CAP_MIN / CAP_RATIO)))\' failed: ' +
      '"Label too long: "X" does not fit in 54 mm at the minimum 3 mm cap height." in file /card.scad, line 69';

    expect(renderErrorReason([line])).toBe(
      'Label too long: "X" does not fit in 54 mm at the minimum 3 mm cap height.'
    );
  });

  it('falls back to a stable, translatable reason code when there is no assert() failure', () => {
    // e.g. a label made entirely of glyphs missing from the vendored font: OpenSCAD writes no
    // /out.stl and stderr has nothing that looks like an assertion.
    const reason = renderErrorReason(['ECHO: some unrelated diagnostic']);
    expect(reason).toBe(NO_OUTPUT_ERROR);
  });

  it('never leaks the internal OpenSCAD part name ("body"/"letters") into the reason', () => {
    // Regression guard: the old message was `OpenSCAD produced no output for part "${part}".` —
    // make sure neither part name can appear regardless of which part failed to render.
    for (const errors of [[], ['ECHO: unrelated']]) {
      const reason = renderErrorReason(errors);
      expect(reason).not.toMatch(/body|letters/);
    }
  });
});
