import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CURRENT_VERSION_ENDPOINT,
  UPDATE_STATUS_ENDPOINT,
  VersionApiError,
  fetchCurrentVersion,
  fetchUpdateStatus,
} from './client';

describe('version api client', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchCurrentVersion', () => {
    it('calls the current version endpoint with credentials and JSON accept header', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ version: '0.0.16' }),
      });

      const result = await fetchCurrentVersion();

      expect(result).toEqual({ version: '0.0.16' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(CURRENT_VERSION_ENDPOINT);
      expect(options).toMatchObject({
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    });

    it('throws a VersionApiError with the status code for non-ok responses', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

      await expect(fetchCurrentVersion()).rejects.toBeInstanceOf(VersionApiError);
      await expect(fetchCurrentVersion()).rejects.toMatchObject({ status: 500 });
    });
  });

  describe('fetchUpdateStatus', () => {
    it('hits the update status endpoint without query params by default', async () => {
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

      const result = await fetchUpdateStatus();

      expect(result.isUpdateAvailable).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(UPDATE_STATUS_ENDPOINT, expect.anything());
    });

    it('appends refresh=true when forceRefresh is set', async () => {
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

      await fetchUpdateStatus({ forceRefresh: true });

      expect(fetchMock).toHaveBeenCalledWith(`${UPDATE_STATUS_ENDPOINT}?refresh=true`, expect.anything());
    });

    it('throws VersionApiError with 403 when admin permission is missing', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });

      await expect(fetchUpdateStatus()).rejects.toMatchObject({
        name: 'VersionApiError',
        status: 403,
      });
    });
  });
});
