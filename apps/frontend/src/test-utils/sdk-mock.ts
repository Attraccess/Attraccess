import { vi } from 'vitest';

/**
 * Factory for `vi.mock('@attraccess/react-query-client/sdk', …)`: every generated SDK function becomes a spy that
 * calls through, so a test can stub single operations with `vi.mocked(sdk.op)`. The generated hooks import the same
 * module, so a stub answers them too.
 */
export function spyOnSdk<T extends object>(actual: T): T {
  return Object.fromEntries(
    Object.entries(actual).map(([name, value]) => [name, typeof value === 'function' ? vi.fn(value) : value]),
  ) as T;
}

/** What a generated SDK call resolves to (with `throwOnError`): the parsed body under `data`. */
export function sdkResult<T>(data: T) {
  return { data, request: new Request('http://localhost/'), response: new Response() } as never;
}
