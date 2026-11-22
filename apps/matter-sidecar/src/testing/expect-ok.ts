import type { HttpResult, JsonBody, Running } from './harness';

/**
 * Asserts that a setup call answered as expected and returns its body. A setup step that fails reports itself here,
 * with the endpoint, the status, the response and the sidecar's log lines, instead of surfacing one step later as an
 * unrelated status from the call that depended on it.
 */
export function expectOk(
  sidecar: Pick<Running, 'logs'>,
  call: string,
  result: HttpResult,
  expectedStatus = 200,
): JsonBody {
  if (result.status !== expectedStatus) {
    const logs = sidecar.logs.length > 0 ? sidecar.logs.join('\n') : '(none)';
    throw new Error(
      `${call}: expected HTTP ${expectedStatus}, got ${result.status} (error code: ${result.body?.error?.code ?? 'none'})\n` +
        `response: ${result.raw.slice(0, 2000)}\nsidecar logs:\n${logs}`,
    );
  }
  return result.body;
}
