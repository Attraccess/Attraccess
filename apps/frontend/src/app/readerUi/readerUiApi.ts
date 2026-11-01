import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, OpenAPI } from '@attraccess/react-query-client';

export type NoScreenPolicy = 'block' | 'card-confirm' | 'allow-with-warning';
export type HookFailurePolicy = 'fail-closed' | 'fail-open';

export interface ResourceReaderUiSettings {
  noScreenPolicy: NoScreenPolicy | null;
  plugins: { plugin: string; widgetsEnabled: boolean; hookFailurePolicy: HookFailurePolicy }[];
}

export interface ReaderUiAlert {
  id: number;
  kind: 'breaker-open' | 'load-failure' | 'crash-loop';
  message: string;
  plugin: string | null;
  readerId: number | null;
  createdAt: string;
}

export interface ReaderUiContributionStatus {
  plugin: string;
  resourceId: number;
  slot: string;
  key: string;
  status: 'rendered' | 'degraded' | 'skipped';
  reason?: string;
}

// Single place for the host-owned reader UI admin routes.
export const readerUiPaths = {
  resource: (resourceId: number) => `/api/resources/${resourceId}/reader-ui-settings`,
  reader: (readerId: number) => `/api/attractaps/${readerId}/reader-ui-settings`,
  contributions: (readerId: number) => `/api/attractaps/${readerId}/reader-ui/contributions`,
  alerts: () => '/api/reader-ui/alerts',
  clearAlert: (id: number) => `/api/reader-ui/alerts/${id}/clear`,
};

async function call<T>(method: 'GET' | 'PUT' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${OpenAPI.BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new ApiError(
      { method, url: path },
      { url: path, ok: false, status: response.status, statusText: response.statusText, body: parsed },
      parsed?.message ?? response.statusText,
    );
  }
  return parsed as T;
}

const keys = {
  resource: (id: number) => ['readerUi', 'resource', id] as const,
  reader: (id: number) => ['readerUi', 'reader', id] as const,
  contributions: (id: number) => ['readerUi', 'contributions', id] as const,
  alerts: ['readerUi', 'alerts'] as const,
};

export const useResourceReaderUiSettings = (resourceId: number) =>
  useQuery({
    queryKey: keys.resource(resourceId),
    queryFn: () => call<ResourceReaderUiSettings>('GET', readerUiPaths.resource(resourceId)),
  });

export function useSaveResourceReaderUiSettings(resourceId: number, onSaved?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: ResourceReaderUiSettings) => call<void>('PUT', readerUiPaths.resource(resourceId), settings),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.resource(resourceId) });
      onSaved?.();
    },
  });
}

export const useReaderReaderUiSettings = (readerId: number | undefined) =>
  useQuery({
    queryKey: keys.reader(readerId ?? -1),
    queryFn: () => call<{ widgetsEnabled: boolean }>('GET', readerUiPaths.reader(readerId as number)),
    enabled: readerId !== undefined,
  });

export function useSaveReaderReaderUiSettings(readerId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: { widgetsEnabled: boolean }) =>
      call<void>('PUT', readerUiPaths.reader(readerId as number), settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.reader(readerId ?? -1) }),
  });
}

export const useReaderUiContributions = (readerId: number | undefined) =>
  useQuery({
    queryKey: keys.contributions(readerId ?? -1),
    queryFn: () => call<ReaderUiContributionStatus[]>('GET', readerUiPaths.contributions(readerId as number)),
    enabled: readerId !== undefined,
  });

export const useReaderUiAlerts = () =>
  useQuery({
    queryKey: keys.alerts,
    queryFn: () => call<ReaderUiAlert[]>('GET', readerUiPaths.alerts()),
    refetchInterval: 30_000,
  });

export function useClearReaderUiAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => call<void>('POST', readerUiPaths.clearAlert(id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.alerts }),
  });
}
