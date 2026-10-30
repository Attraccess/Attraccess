import { redactTokens } from './websocket-log';

describe('redactTokens', () => {
  it('replaces token keys at any depth and keeps everything else', () => {
    const event = {
      type: 'READER_AUTHENTICATE',
      payload: { id: 7, token: 'secret-1', nested: [{ Token: 'secret-2', keep: 'yes' }] },
    };

    const redacted = redactTokens(event);

    expect(redacted).toEqual({
      type: 'READER_AUTHENTICATE',
      payload: { id: 7, token: '[redacted]', nested: [{ Token: '[redacted]', keep: 'yes' }] },
    });
    expect(JSON.stringify(redacted)).not.toContain('secret');
  });

  it('does not modify the original value', () => {
    const payload = { id: 1, token: 'secret' };
    redactTokens(payload);
    expect(payload.token).toBe('secret');
  });

  it('passes primitives, null and undefined through', () => {
    expect(redactTokens(null)).toBeNull();
    expect(redactTokens(undefined)).toBeUndefined();
    expect(redactTokens('token')).toBe('token');
    expect(redactTokens(3)).toBe(3);
  });
});
