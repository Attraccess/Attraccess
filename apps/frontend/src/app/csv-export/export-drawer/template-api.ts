import { useMutation, useQuery } from '@tanstack/react-query';
import { OpenAPI } from '@attraccess/react-query-client';

export enum CsvExportType {
  RESOURCE_USAGE_HOURS = 'resourceUsageHours',
  BILLING_TRANSACTIONS = 'billingTransactions',
}

export enum CsvExportTemplateColumnType {
  FIELD = 'field',
  CONSTANT = 'constant',
}

export interface CsvExportTemplateColumnDto {
  type: CsvExportTemplateColumnType;
  header: string;
  fieldKey?: string | null;
  value?: string | null;
}

export interface CsvExportTemplate {
  id: number;
  name: string;
  exportType: CsvExportType;
  columns: CsvExportTemplateColumnDto[];
  createdAt: string;
  updatedAt: string;
}

interface CreateCsvExportTemplateDto {
  name: string;
  exportType: CsvExportType;
  columns: CsvExportTemplateColumnDto[];
}

interface UpdateCsvExportTemplateDto {
  name?: string;
  columns?: CsvExportTemplateColumnDto[];
}

export const csvExportTemplatesQueryKey = 'csvExportTemplates';

async function requestCsvTemplates<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');

  if (init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (OpenAPI.TOKEN) {
    const method = (init?.method ?? 'GET') as 'DELETE' | 'GET' | 'HEAD' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT';
    const token = typeof OpenAPI.TOKEN === 'string' ? OpenAPI.TOKEN : await OpenAPI.TOKEN({ method, url: path });
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(`${OpenAPI.BASE}/api/analytics/csv-export-templates${path}`, {
    ...init,
    headers,
    credentials: OpenAPI.WITH_CREDENTIALS ? OpenAPI.CREDENTIALS : undefined,
  });

  if (!response.ok) {
    throw new Error(`CSV export template request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function useCsvExportTemplates(exportType: CsvExportType) {
  return useQuery({
    queryKey: [csvExportTemplatesQueryKey, exportType],
    queryFn: () => requestCsvTemplates<CsvExportTemplate[]>(`?exportType=${encodeURIComponent(exportType)}`),
  });
}

export function useCreateCsvExportTemplate(options: { onSuccess: (template: CsvExportTemplate) => void; onError: () => void }) {
  return useMutation({
    mutationFn: ({ requestBody }: { requestBody: CreateCsvExportTemplateDto }) =>
      requestCsvTemplates<CsvExportTemplate>('', { method: 'POST', body: JSON.stringify(requestBody) }),
    ...options,
  });
}

export function useUpdateCsvExportTemplate(options: { onSuccess: (template: CsvExportTemplate) => void; onError: () => void }) {
  return useMutation({
    mutationFn: ({ id, requestBody }: { id: number; requestBody: UpdateCsvExportTemplateDto }) =>
      requestCsvTemplates<CsvExportTemplate>(`/${id}`, { method: 'PATCH', body: JSON.stringify(requestBody) }),
    ...options,
  });
}

export function useDeleteCsvExportTemplate(options: { onSuccess: () => void; onError: () => void }) {
  return useMutation({
    mutationFn: ({ id }: { id: number }) => requestCsvTemplates<void>(`/${id}`, { method: 'DELETE' }),
    ...options,
  });
}
