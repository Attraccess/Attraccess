import type { HttpResult, JsonBody, Running } from './harness';

const MAX_BODY_CHARS = 2000;

/**
 * Asserts that a setup call answered with the expected status (200 unless given) and returns its body. A setup step that
 * fails reports itself here, with the request, the status, the error code, the response and the sidecar's log lines,
 * instead of surfacing one step later as an unrelated status from the call that depended on it.
 */
export function expectOk(sidecar: Pick<Running, 'logs'>, result: HttpResult, expectedStatus = 200): JsonBody {
  if (result.status === expectedStatus) return result.body;
  const body =
    result.raw.length > MAX_BODY_CHARS
      ? `${result.raw.slice(0, MAX_BODY_CHARS)}… (truncated)`
      : result.raw || '(empty)';
  const logs = sidecar.logs.length > 0 ? sidecar.logs.join('\n') : '(none)';
  const error = new Error(
    `${result.request}: expected HTTP ${expectedStatus}, got ${result.status} ` +
      `(error code: ${result.body?.error?.code ?? 'none'})\nresponse: ${body}\nsidecar logs:\n${logs}`,
  );
  // Point the reported location at the test line that made the call, not at this helper.
  Error.captureStackTrace(error, expectOk);
  throw error;
}
