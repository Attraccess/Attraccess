import { describe, expect, it } from 'vitest';
import en from './switchProject/en.json';
import de from './switchProject/de.json';
import summaryEn from '../../../../billing/sessionSummary/en.json';
import summaryDe from '../../../../billing/sessionSummary/de.json';

// One switch is one action and one result, wherever it shows; the reader says the same.
describe.each([
  ['en', en, summaryEn],
  ['de', de, summaryDe],
])('the wording of a project change (%s)', (_language, texts, summary) => {
  it('names the action the same on the session, in the dialog title and on its confirm button', () => {
    expect(texts.dialog.title).toBe(texts.change);
    expect(texts.dialog.confirm).toBe(texts.change);
  });

  it('names the result the same in the notice and in the charge popup', () => {
    expect(summary.part.title).toBe(texts.success.title);
  });
});
