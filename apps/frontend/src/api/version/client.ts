import { UpdateStatus, VersionInfo } from './types';

export const CURRENT_VERSION_ENDPOINT = '/api/version';
export const UPDATE_STATUS_ENDPOINT = '/api/version/updates';

export class VersionApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'VersionApiError';
  }
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new VersionApiError(response.status, `Request to ${url} failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchCurrentVersion(): Promise<VersionInfo> {
  return requestJson<VersionInfo>(CURRENT_VERSION_ENDPOINT);
}

export function fetchUpdateStatus(options?: { forceRefresh?: boolean }): Promise<UpdateStatus> {
  const url = options?.forceRefresh
    ? `${UPDATE_STATUS_ENDPOINT}?refresh=true`
    : UPDATE_STATUS_ENDPOINT;
  return requestJson<UpdateStatus>(url);
}
