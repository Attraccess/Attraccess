import { AuthAuditLogger } from './auth-audit.logger';

describe('AuthAuditLogger', () => {
  let logger: AuthAuditLogger;
  let record: jest.Mock;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    record = jest.fn().mockResolvedValue({ status: 'recorded' });
    logger = new AuthAuditLogger({ record } as never);
    warnSpy = jest.spyOn((logger as unknown as { logger: { warn: jest.Mock } }).logger, 'warn');
  });

  it('records a durable login failure and preserves the Fail2ban-compatible security feed', () => {
    logger.log({
      type: 'login',
      outcome: 'invalid_credentials',
      ip: '1.2.3.4',
      userId: 42,
      username: 'alice',
      reason: 'bad_password',
    });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'login',
        outcome: 'failed',
        actorId: 42,
        subjectId: 42,
        details: { reason: 'invalid_credentials' },
        request: { ipAddress: '1.2.3.4' },
      }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^auth\.failed type=login outcome=invalid_credentials ip=1\.2\.3\.4 user_id=42 username=alice auth_method=anonymous api_token_id=- ts=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z reason=bad_password$/,
      ),
    );
  });

  it('records successful registration outcomes', () => {
    logger.log({ type: 'register', outcome: 'success', ip: '2.2.2.2' });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'registration', outcome: 'succeeded', details: {} }),
    );
  });

  it.each(['invalid_credentials', 'rate_limited', 'account_locked'] as const)(
    'redacts email identifiers from %s application logs',
    async (outcome) => {
      await logger.log({ type: 'login', outcome, ip: '1.2.3.4', username: 'Alice@Example.com' });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('username=[redacted]'));
      expect(warnSpy.mock.calls[0][0]).not.toContain('Alice@Example.com');
    },
  );

  it('records SSO account-link failures as identity audit and keeps them in the Fail2ban feed', () => {
    logger.log({ type: 'sso_link_account', outcome: 'invalid_credentials', ip: '1.2.3.4', userId: 7 });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sso_account_link',
        outcome: 'failed',
        details: { reason: 'invalid_credentials' },
      }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^auth\.failed type=sso_link_account outcome=invalid_credentials ip=1\.2\.3\.4 user_id=7 /),
    );
  });

  it('logs SSO provisioning failures without an identity audit entry', () => {
    logger.log({
      type: 'sso_provisioning',
      outcome: 'invalid_credentials',
      ip: '1.2.3.4',
      username: 'provider:OIDC:1',
    });

    expect(record).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^auth\.failed type=sso_provisioning outcome=invalid_credentials ip=1\.2\.3\.4 /),
    );
  });

  it('does not persist unsupported legacy event types', () => {
    logger.log({ type: 'api_token', outcome: 'success', ip: '2.2.2.2', userId: 42 });
    expect(record).not.toHaveBeenCalled();
  });
});
