import '@testing-library/jest-dom/vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryWrapper } from '../../test-utils/wrappers';
import {
  CURRENT_VERSION_QUERY_KEY,
  UPDATE_STATUS_QUERY_KEY,
  useCurrentVersion,
  useUpdateStatus,
} from './useUpdateStatus';

describe('version react-query hooks', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes stable query keys', () => {
    expect(CURRENT_VERSION_QUERY_KEY).toEqual(['version', 'current']);
    expect(UPDATE_STATUS_QUERY_KEY).toEqual(['version', 'updates']);
  });

  describe('useCurrentVersion', () => {
    it('resolves with the current version payload', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ version: '0.0.16' }),
      });

      const { result } = renderHook(() => useCurrentVersion(), { wrapper: QueryWrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({ version: '0.0.16' });
    });
  });

  describe('useUpdateStatus', () => {
    it('resolves with the update status payload', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          currentVersion: '0.0.16',
          latestVersion: '0.1.0',
          isUpdateAvailable: true,
          checkSucceeded: true,
          latestRelease: null,
        }),
      });

      const { result } = renderHook(() => useUpdateStatus(), { wrapper: QueryWrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toMatchObject({
        isUpdateAvailable: true,
        latestVersion: '0.1.0',
      });
    });

    it('surfaces errors from the api', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });

      const { result } = renderHook(() => useUpdateStatus(), { wrapper: QueryWrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toMatchObject({ name: 'VersionApiError', status: 403 });
    });

    it('does not fetch when disabled via options', async () => {
      const { result } = renderHook(
        () => useUpdateStatus({ enabled: false }),
        { wrapper: QueryWrapper },
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
