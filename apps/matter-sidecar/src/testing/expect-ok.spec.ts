import { expectOk } from './expect-ok';
import type { HttpResult } from './harness';

const result = (status: number, raw: string, body: unknown = raw): HttpResult => ({
  request: 'POST /v1/backup/snapshot',
  status,
  headers: {},
  body,
  raw,
});

describe('expectOk', () => {
  it('returns the body when the status is the expected one', () => {
    expect(expectOk({ logs: [] }, result(200, '{"a":1}', { a: 1 }))).toEqual({ a: 1 });
    expect(expectOk({ logs: [] }, result(404, '{}', { gone: true }), 404)).toEqual({ gone: true });
  });

  it('names the request, the status, the error code, the response and every log line', () => {
    const raw = '{"error":{"code":"busy","message":"Another operation is in progress."}}';
    const logs = ['{"level":"info","message":"listening"}', '{"level":"error","message":"create failed"}'];
    expect(() => expectOk({ logs }, result(409, raw, JSON.parse(raw)))).toThrow(
      'POST /v1/backup/snapshot: expected HTTP 200, got 409 (error code: busy)\n' +
        `response: ${raw}\nsidecar logs:\n${logs.join('\n')}`,
    );
  });

  it('copes with a body that is text, null or empty, and with no logs', () => {
    expect(() => expectOk({ logs: [] }, result(502, 'Bad Gateway'))).toThrow(
      'got 502 (error code: none)\nresponse: Bad Gateway\nsidecar logs:\n(none)',
    );
    expect(() => expectOk({ logs: [] }, result(500, 'null', null))).toThrow('(error code: none)\nresponse: null');
    expect(() => expectOk({ logs: [] }, result(504, ''))).toThrow('response: (empty)');
  });

  it('cuts a long response and says so', () => {
    const raw = 'x'.repeat(2500);
    expect(() => expectOk({ logs: [] }, result(500, raw))).toThrow(`response: ${'x'.repeat(2000)}… (truncated)\n`);
  });

  it('reports the caller as the failing location', () => {
    let stack = '';
    try {
      expectOk({ logs: [] }, result(409, ''));
    } catch (error) {
      stack = (error as Error).stack ?? '';
    }
    const firstFrame = stack.split('\n').find((line) => line.trimStart().startsWith('at '));
    expect(firstFrame).toContain('expect-ok.spec.ts');
  });
});
