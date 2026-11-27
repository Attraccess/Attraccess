import { conversionErrorText } from './conversionErrorText';

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `[${key} ${JSON.stringify(params)}]` : `[${key}]`;
const apiError = (status: number | undefined, body: unknown) => Object.assign(new Error('Conflict'), { status, body });

describe('conversionErrorText', () => {
  it('names each refused gate in the UI language, not as a raw code', () => {
    const error = apiError(409, {
      message: 'This reader cannot be secured now: reader-offline',
      blockers: ['reader-offline'],
    });
    expect(conversionErrorText(error, t)).toBe('[blocker.reader-offline]');
  });

  it.each([
    [400, 'The typed name does not match the reader name', '[start.nameMismatch]'],
    [409, 'The reader did not answer the preflight in time', '[error.preflightTimeout]'],
    [409, 'No signing key for this reader', '[noSigningKey]'],
    [409, 'Another conversion is running', '[blocker.conversion-running]'],
    [409, 'This conversion cannot be retried', '[error.cannotRetry]'],
    [409, 'This reader cannot be secured now', '[error.cannotSecureNow]'],
  ])('translates the known %i refusal "%s"', (status, message, expected) => {
    expect(conversionErrorText(apiError(status, { message }), t)).toBe(expected);
  });

  it('does not match a known message under another status', () => {
    expect(conversionErrorText(apiError(500, { message: 'No signing key for this reader' }), t)).toBe(
      '[error.genericStatus {"status":500}]',
    );
  });

  it('shows a translated generic error with the status instead of the raw server text', () => {
    expect(conversionErrorText(apiError(409, { message: 'Something new' }), t)).toBe(
      '[error.genericStatus {"status":409}]',
    );
  });

  it('shows a translated generic error without a status (network failure)', () => {
    expect(conversionErrorText(new TypeError('Failed to fetch'), t)).toBe('[error.generic]');
  });

  it('is empty without an error', () => {
    expect(conversionErrorText(null, t)).toBeUndefined();
  });
});
