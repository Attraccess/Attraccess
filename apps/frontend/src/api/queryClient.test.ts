import { describe, expect, it } from 'vitest';
import { ApiError } from '@attraccess/react-query-client';
import { DEFAULT_RETRIES, queryClient } from './queryClient';

const apiError = (status: number) =>
  new ApiError(
    { method: 'GET', url: '/api/example' },
    { url: '/api/example', ok: false, status, statusText: String(status), body: undefined },
    String(status),
  );

const retry = queryClient.getDefaultOptions().queries?.retry as (failureCount: number, error: unknown) => boolean;

describe('queryClient retry rule', () => {
  it('does not retry a 403', () => {
    expect(retry(0, apiError(403))).toBe(false);
  });

  it(`retries other failures up to ${DEFAULT_RETRIES} times`, () => {
    for (let failureCount = 0; failureCount < DEFAULT_RETRIES; failureCount++) {
      expect(retry(failureCount, apiError(500))).toBe(true);
    }
    expect(retry(DEFAULT_RETRIES, apiError(500))).toBe(false);
    expect(retry(0, new TypeError('Failed to fetch'))).toBe(true);
  });
});
