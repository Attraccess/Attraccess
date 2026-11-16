import { TokenAuthenticator } from './auth';
import { TEST_TOKEN } from './testing/config';
import { createLogger } from './logger';

const PREVIOUS = 'previous-token-0123456789abcdef0123456789';
const GUESS = `${'g'.repeat(20)}guess${'g'.repeat(20)}`;

function setup() {
  const lines: string[] = [];
  let clock = 1_000_000;
  // No secrets are passed to the logger, so these tests prove the authenticator itself never logs a value.
  const auth = new TokenAuthenticator(
    [TEST_TOKEN, PREVIOUS],
    createLogger((line) => lines.push(line)),
    () => clock,
  );
  return {
    auth,
    lines,
    entries: () => lines.map((line) => JSON.parse(line)),
    advance: (ms: number) => (clock += ms),
  };
}

const bearer = (value: string) => ({ authorization: `Bearer ${value}` });

describe('TokenAuthenticator', () => {
  it('accepts the current and the previous token without logging', () => {
    const { auth, lines } = setup();
    expect(auth.check(bearer(TEST_TOKEN))).toBeNull();
    expect(auth.check(bearer(PREVIOUS))).toBeNull();
    expect(lines).toEqual([]);
  });

  it('accepts a lowercase scheme, as HTTP auth schemes are case-insensitive', () => {
    expect(setup().auth.check({ authorization: `bearer ${TEST_TOKEN}` })).toBeNull();
  });

  it.each([
    ['missing', {}, 'missing'],
    ['an empty value', { authorization: '' }, 'malformed'],
    ['another scheme', { authorization: `Basic ${TEST_TOKEN}` }, 'malformed'],
    ['no token', { authorization: 'Bearer' }, 'malformed'],
    ['an empty token', { authorization: 'Bearer ' }, 'malformed'],
    ['a double space', { authorization: `Bearer  ${TEST_TOKEN}` }, 'malformed'],
    ['a trailing space', { authorization: `Bearer ${TEST_TOKEN} ` }, 'malformed'],
    ['two comma-joined credentials', { authorization: `Bearer ${TEST_TOKEN}, Bearer ${TEST_TOKEN}` }, 'malformed'],
    ['two tokens', { authorization: `Bearer ${TEST_TOKEN} ${TEST_TOKEN}` }, 'malformed'],
    ['a token that is too short', bearer('a'.repeat(31)), 'malformed'],
    ['a token that is too long', bearer('a'.repeat(513)), 'malformed'],
    ['a comma-joined token pair without spaces', bearer(`${TEST_TOKEN},${TEST_TOKEN}`), 'invalid'],
    ['a token that only starts with the current one', bearer(`${TEST_TOKEN}x`), 'invalid'],
    ['a wrong token', bearer(GUESS), 'invalid'],
  ])('rejects %s', (_name, headers, reason) => {
    expect(setup().auth.check(headers)).toBe(reason);
  });

  it('rejects a repeated header that Node delivers as an array', () => {
    const headers = { authorization: [`Bearer ${TEST_TOKEN}`, `Bearer ${TEST_TOKEN}`] } as unknown as Record<
      string,
      string
    >;
    expect(setup().auth.check(headers)).toBe('malformed');
  });

  it('logs the first failure at warn, suppresses more within 10 s and reports the count when it logs again', () => {
    const { auth, entries, advance } = setup();
    auth.check(bearer(GUESS), '192.0.2.1');
    expect(entries()).toEqual([
      { level: 'warn', message: 'authentication failed', reason: 'invalid', remoteAddress: '192.0.2.1' },
    ]);
    for (let i = 0; i < 3; i += 1) {
      advance(3_000);
      auth.check({});
    }
    // 9 s after the first log: still suppressed.
    expect(entries()).toHaveLength(1);
    advance(999);
    auth.check({ authorization: 'Bearer short' });
    expect(entries()).toHaveLength(1);
    advance(1);
    auth.check({});
    expect(entries()).toHaveLength(2);
    expect(entries()[1]).toEqual({
      level: 'warn',
      message: 'authentication failed',
      reason: 'missing',
      suppressedSinceLast: 4,
    });
    advance(10_000);
    auth.check(bearer(GUESS));
    // The count restarts after each log line, so nothing was suppressed since the last one.
    expect(entries()[2]).toEqual({ level: 'warn', message: 'authentication failed', reason: 'invalid' });
  });

  it('does not count successful requests as suppressed failures', () => {
    const { auth, entries, advance } = setup();
    auth.check({});
    auth.check(bearer(TEST_TOKEN));
    advance(10_000);
    auth.check({});
    expect(entries()[1]).not.toHaveProperty('suppressedSinceLast');
  });

  it('never logs a token or the header value', () => {
    const { auth, lines, advance } = setup();
    const headers = [
      `Bearer ${GUESS}`,
      `Bearer ${TEST_TOKEN}x`,
      `Bearer  ${TEST_TOKEN}`,
      `Basic ${PREVIOUS}`,
      `Bearer ${TEST_TOKEN}, Bearer ${PREVIOUS}`,
    ];
    for (const authorization of headers) {
      auth.check({ authorization });
      advance(10_000);
    }
    expect(lines).toHaveLength(headers.length);
    const everything = lines.join('\n');
    for (const secret of [GUESS, TEST_TOKEN, PREVIOUS, 'Bearer', 'Basic']) expect(everything).not.toContain(secret);
  });
});
