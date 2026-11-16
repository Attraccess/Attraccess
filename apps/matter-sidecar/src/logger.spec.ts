import { createLogger } from './logger';

// Shaped like `openssl rand -base64 48`, which the operator guide recommends.
const TOKEN = 'kq7Vb3+Yt1/ZpN0wXr5uLm2sHc8dEf4gJa6iOy9TzQeRvUoWnBxKlMjPhGtSdAcF';

function capture(secrets: readonly string[] = [TOKEN]) {
  const lines: string[] = [];
  return { lines, log: createLogger((line) => lines.push(line), secrets) };
}

describe('createLogger masking', () => {
  it('masks a configured token wherever it appears', () => {
    const { lines, log } = capture();
    log('warn', `leaked ${TOKEN} in the message`, { field: TOKEN, nested: { deeper: [`x${TOKEN}y`] } });
    expect(lines[0]).not.toContain(TOKEN);
    expect(JSON.parse(lines[0])).toEqual({
      level: 'warn',
      message: 'leaked [redacted] in the message',
      field: '[redacted]',
      nested: { deeper: ['x[redacted]y'] },
    });
  });

  it('masks anything that follows Bearer, in any case, even when the value is not a configured token', () => {
    const { lines, log } = capture([]);
    log('info', 'header', { a: 'Bearer xyz', b: 'bearer  other-value trailing', c: 'BEARER third' });
    expect(JSON.parse(lines[0])).toMatchObject({
      a: 'Bearer [redacted]',
      b: 'Bearer [redacted] trailing',
      c: 'Bearer [redacted]',
    });
  });

  it('masks the token inside a JSON-escaped context and keeps the line valid JSON', () => {
    const { lines, log } = capture();
    const embedded = JSON.stringify({ authorization: `Bearer ${TOKEN}`, token: TOKEN });
    log('error', 'upstream said', { body: embedded, twice: JSON.stringify({ body: embedded }) });
    expect(lines[0]).not.toContain(TOKEN);
    const parsed = JSON.parse(lines[0]);
    expect(JSON.parse(parsed.body)).toEqual({ authorization: 'Bearer [redacted]', token: '[redacted]' });
    expect(JSON.parse(JSON.parse(parsed.twice).body)).toEqual({
      authorization: 'Bearer [redacted]',
      token: '[redacted]',
    });
  });

  it('leaves lines without secrets untouched', () => {
    const { lines, log } = capture();
    const fields = {
      reason: 'invalid',
      remoteAddress: '127.0.0.1',
      count: 3,
      ok: true,
      quote: 'say "hi" \\ there',
      bearerWord: 'Bearer',
      partial: TOKEN.slice(0, 20),
    };
    log('info', 'authentication failed', fields);
    expect(lines[0]).toBe(JSON.stringify({ level: 'info', message: 'authentication failed', ...fields }));
  });

  it('masks a configured token that contains characters JSON escapes', () => {
    const tricky = 'abc"def\\ghi0123456789abcdef0123456789';
    const { lines, log } = capture([tricky]);
    log('warn', 'leak', { header: `Bearer ${tricky}`, raw: tricky });
    expect(lines[0]).not.toContain(JSON.stringify(tricky).slice(1, -1));
    expect(lines[0]).not.toContain('ghi0123456789');
    expect(JSON.parse(lines[0])).toMatchObject({ header: 'Bearer [redacted]', raw: '[redacted]' });
  });

  it('ignores empty secrets instead of masking between every character', () => {
    const { lines, log } = capture(['']);
    log('info', 'plain message');
    expect(JSON.parse(lines[0]).message).toBe('plain message');
  });
});
