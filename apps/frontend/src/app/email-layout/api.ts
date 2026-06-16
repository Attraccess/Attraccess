import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OpenAPI } from '@attraccess/react-query-client';

export interface EmailLayout {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface PreviewResult {
  html: string;
  hasErrors: boolean;
  error?: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = OpenAPI.BASE ?? '';
  const response = await fetch(`${base}/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json() as Promise<T>;
}

export const EMAIL_LAYOUT_QUERY_KEY = 'email-layout-global';

export function useEmailLayout() {
  return useQuery<EmailLayout>({
    queryKey: [EMAIL_LAYOUT_QUERY_KEY],
    queryFn: () => apiFetch<EmailLayout>('/email-layout'),
  });
}

export function useUpdateEmailLayout() {
  const queryClient = useQueryClient();
  return useMutation<EmailLayout, Error, { body: string }>({
    mutationFn: (data) =>
      apiFetch<EmailLayout>('/email-layout', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EMAIL_LAYOUT_QUERY_KEY] });
    },
  });
}

export function usePreviewEmailLayout() {
  return useMutation<PreviewResult, Error, { body: string }>({
    mutationFn: (data) =>
      apiFetch<PreviewResult>('/email-layout/preview', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  });
}
