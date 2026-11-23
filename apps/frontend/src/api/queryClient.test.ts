import { describe, expect, it } from 'vitest';
import { ApiError } from '@attraccess/react-query-client';
import { DEFAULT_RETRIES, queryClient } from './queryClient';
import { shouldRetryCurrentUser } from './retryRules';
import { isUnauthenticatedError } from './isUnauthenticatedError';

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

  it('does not retry a 404', () => {
    expect(retry(0, apiError(404))).toBe(false);
  });

  it(`retries other failures up to ${DEFAULT_RETRIES} times`, () => {
    for (let failureCount = 0; failureCount < DEFAULT_RETRIES; failureCount++) {
      expect(retry(failureCount, apiError(500))).toBe(true);
    }
    expect(retry(DEFAULT_RETRIES, apiError(500))).toBe(false);
    expect(retry(0, new TypeError('Failed to fetch'))).toBe(true);
  });

  it('keeps retrying a 401 for other queries (unchanged app-wide behaviour)', () => {
    expect(retry(0, apiError(401))).toBe(true);
  });
});

describe('current-user retry rule', () => {
  it('does not retry a 401 or a 403', () => {
    expect(shouldRetryCurrentUser(0, apiError(401))).toBe(false);
    expect(shouldRetryCurrentUser(0, apiError(403))).toBe(false);
  });

  it.each([apiError(503), apiError(500), apiError(429), new TypeError('Failed to fetch')])(
    `retries %s up to ${DEFAULT_RETRIES} times`,
    (error) => {
      for (let failureCount = 0; failureCount < DEFAULT_RETRIES; failureCount++) {
        expect(shouldRetryCurrentUser(failureCount, error)).toBe(true);
      }
      expect(shouldRetryCurrentUser(DEFAULT_RETRIES, error)).toBe(false);
    },
  );
});

describe('isUnauthenticatedError', () => {
  it('matches only an API 401', () => {
    expect(isUnauthenticatedError(apiError(401))).toBe(true);
    expect(isUnauthenticatedError(apiError(403))).toBe(false);
    expect(isUnauthenticatedError(new Error('401'))).toBe(false);
  });
});
