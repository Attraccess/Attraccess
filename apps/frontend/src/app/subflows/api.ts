import { useQuery } from '@tanstack/react-query';
import { ResourceFlowEdgeDto, ResourceFlowNodeDto, ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';

export type SubFlowSummary = {
  id: number;
  name: string;
  description?: string | null;
  inputs: string[];
  outputs: string[];
  createdAt: string;
  updatedAt: string;
};

export type SubFlowDetail = SubFlowSummary & {
  nodes: ResourceFlowNodeDto[];
  edges: ResourceFlowEdgeDto[];
  validationErrors?: Array<{
    nodeId: string;
    nodeType: string;
    field: string;
    message: string;
    value?: unknown;
  }>;
};

export type SubFlowSavePayload = Pick<SubFlowDetail, 'name' | 'description' | 'nodes' | 'edges'>;

async function request<TResponse>(path: string, options?: RequestInit): Promise<TResponse> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || response.statusText);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return response.json() as Promise<TResponse>;
}

export const subFlowsQueryKey = ['sub-flows'];

export function useSubFlows(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: subFlowsQueryKey,
    queryFn: () => request<SubFlowSummary[]>('/api/sub-flows'),
    enabled: options?.enabled ?? true,
  });
}

export function useSubFlow(subFlowId: number) {
  return useQuery({
    queryKey: [...subFlowsQueryKey, subFlowId],
    queryFn: () => request<SubFlowDetail>(`/api/sub-flows/${subFlowId}`),
    enabled: Number.isFinite(subFlowId),
  });
}

export function useSubFlowNodeSchemas() {
  return useQuery({
    queryKey: [...subFlowsQueryKey, 'node-schemas'],
    queryFn: () => request<ResourceFlowNodeSchemaDto[]>('/api/sub-flows/node-schemas'),
  });
}

export async function createSubFlow(payload: SubFlowSavePayload) {
  return request<SubFlowDetail>('/api/sub-flows', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateSubFlow(subFlowId: number, payload: SubFlowSavePayload) {
  return request<SubFlowDetail>(`/api/sub-flows/${subFlowId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteSubFlow(subFlowId: number) {
  return request<void>(`/api/sub-flows/${subFlowId}`, {
    method: 'DELETE',
  });
}
