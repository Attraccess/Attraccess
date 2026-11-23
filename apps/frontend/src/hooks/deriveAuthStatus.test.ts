import { describe, expect, it } from 'vitest';
import { ApiError } from '@attraccess/react-query-client';
import { deriveAuthStatus } from './deriveAuthStatus';

const apiError = (status: number) =>
  new ApiError(
    { method: 'GET', url: '/api/users/me' },
    { url: '/api/users/me', ok: false, status, statusText: String(status), body: undefined },
    String(status),
  );
const user = { id: 1 };
const base = {
  isInitialized: true,
  logoutStatus: 'idle',
  data: undefined,
  error: null,
  isFetching: false,
  isPaused: false,
  hasFailedBefore: false,
};

describe('deriveAuthStatus', () => {
  it('is loading before initialization and before the first answer', () => {
    expect(deriveAuthStatus({ ...base, isInitialized: false })).toBe('loading');
    expect(deriveAuthStatus(base)).toBe('loading');
    expect(deriveAuthStatus({ ...base, isFetching: true })).toBe('loading');
  });

  it('keeps the error screen while a retry after a failure is in flight (TanStack clears the error meanwhile)', () => {
    expect(deriveAuthStatus({ ...base, isFetching: true, hasFailedBefore: true })).toBe('error');
  });

  it('offers Retry instead of booting while the first request waits offline', () => {
    expect(deriveAuthStatus({ ...base, isPaused: true })).toBe('error');
    expect(deriveAuthStatus({ ...base, data: null, isPaused: true })).toBe('unauthenticated');
    expect(deriveAuthStatus({ ...base, data: user, isPaused: true })).toBe('authenticated');
  });

  it('keeps the sign-in page while a signed-out answer is refetched', () => {
    expect(deriveAuthStatus({ ...base, data: null, isFetching: true })).toBe('unauthenticated');
    expect(deriveAuthStatus({ ...base, data: null, isFetching: true, hasFailedBefore: true })).toBe('unauthenticated');
  });

  it('keeps a loaded user signed in, even when a later refetch failed', () => {
    expect(deriveAuthStatus({ ...base, data: user })).toBe('authenticated');
    expect(deriveAuthStatus({ ...base, data: user, error: apiError(503) })).toBe('authenticated');
  });

  it('treats only a 401 as signed out', () => {
    expect(deriveAuthStatus({ ...base, error: apiError(401) })).toBe('unauthenticated');
    expect(deriveAuthStatus({ ...base, error: apiError(503) })).toBe('error');
    expect(deriveAuthStatus({ ...base, error: apiError(403) })).toBe('error');
    expect(deriveAuthStatus({ ...base, error: new TypeError('Failed to fetch') })).toBe('error');
  });

  it('shows the sign-in page after logout, but an error when the next load fails', () => {
    expect(deriveAuthStatus({ ...base, data: null })).toBe('unauthenticated');
    expect(deriveAuthStatus({ ...base, data: null, error: apiError(503) })).toBe('error');
    expect(deriveAuthStatus({ ...base, data: null, error: apiError(401) })).toBe('unauthenticated');
  });

  it('lets a started or ended logout win over any cached user', () => {
    expect(deriveAuthStatus({ ...base, logoutStatus: 'pending', data: user })).toBe('unauthenticated');
    expect(deriveAuthStatus({ ...base, logoutStatus: 'ended', data: user })).toBe('unauthenticated');
    expect(deriveAuthStatus({ ...base, logoutStatus: 'ended', error: apiError(503) })).toBe('unauthenticated');
  });
});
