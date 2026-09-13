import { AuthAuditLogger } from './auth-audit.logger';

describe('AuthAuditLogger', () => {
  let logger: AuthAuditLogger;
  let record: jest.Mock;

  beforeEach(() => {
    record = jest.fn().mockResolvedValue({ status: 'recorded' });
    logger = new AuthAuditLogger({ record } as never);
  });

  it('records a durable login failure without legacy stdout output', () => {
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
  });

  it('records successful registration outcomes', () => {
    logger.log({ type: 'register', outcome: 'success', ip: '2.2.2.2' });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'registration', outcome: 'succeeded', details: {} }),
    );
  });

  it('does not persist unsupported legacy event types', () => {
    logger.log({ type: 'api_token', outcome: 'success', ip: '2.2.2.2', userId: 42 });
    expect(record).not.toHaveBeenCalled();
  });
});
