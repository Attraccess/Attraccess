import { AuthAuditLogger } from './auth-audit.logger';

describe('AuthAuditLogger', () => {
  let logger: AuthAuditLogger;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new AuthAuditLogger();
    warnSpy = jest.spyOn((logger as unknown as { logger: { warn: jest.Mock } }).logger, 'warn');
    logSpy = jest.spyOn((logger as unknown as { logger: { log: jest.Mock } }).logger, 'log');
  });

  it('produces a fail2ban-parseable line with stable field order on failure', () => {
    logger.log({
      type: 'login',
      outcome: 'invalid_credentials',
      ip: '1.2.3.4',
      userId: 42,
      username: 'alice',
      reason: 'bad_password',
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const line = warnSpy.mock.calls[0][0] as string;
    expect(line).toMatch(
      /^auth\.failed type=login outcome=invalid_credentials ip=1\.2\.3\.4 user_id=42 username=alice ts=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z reason=bad_password$/,
    );
  });

  it('uses log level on success and writes auth.success prefix', () => {
    logger.log({ type: 'login', outcome: 'success', ip: '1.2.3.4', userId: 42, username: 'alice' });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    expect(line.startsWith('auth.success ')).toBe(true);
    expect(line).toContain('outcome=success');
    expect(line).toContain('user_id=42');
  });

  it('sanitizes whitespace and quotes in field values', () => {
    logger.log({
      type: 'login',
      outcome: 'invalid_credentials',
      ip: '1.2.3.4',
      username: 'name with spaces',
      reason: 'has "quotes"',
    });
    const line = warnSpy.mock.calls[0][0] as string;
    expect(line).toContain('username=name_with_spaces');
    expect(line).toContain('reason=has_quotes_');
  });

  it('renders missing fields with placeholder', () => {
    logger.log({ type: 'register', outcome: 'rate_limited', ip: '2.2.2.2' });
    const line = warnSpy.mock.calls[0][0] as string;
    expect(line).toContain('user_id=-');
    expect(line).toContain('username=-');
  });
});
