import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useFlowNodeSchemasQuery, type FlowOwner } from './flowOwner';

const failingFetch = vi.hoisted(() => vi.fn(() => Promise.reject(new Error('schemas unavailable'))));

// The generated hooks are thin useQuery wrappers; keep that shape with a request that always fails.
vi.mock('@attraccess/react-query-client', () => {
  const schemaQuery =
    (key: string) => (_client: unknown, _key: unknown, options?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>) =>
      useQuery({ queryKey: [key], queryFn: failingFetch, ...options });
  return {
    useGetNodeSchemas: schemaQuery('resource-schemas'),
    useGetGlobalFlowNodeSchemas: schemaQuery('global-schemas'),
  };
});

afterEach(() => {
  cleanup();
  failingFetch.mockClear();
});

function SchemaState({ owner, label }: { owner: FlowOwner; label: string }) {
  const { isError } = useFlowNodeSchemasQuery(owner);
  return <p>{`${label}:${isError ? 'error' : 'pending'}`}</p>;
}

it.each<FlowOwner>([
  { kind: 'resource', resourceId: 1 },
  { kind: 'global', flowId: 1 },
])('keeps a failed schema query failed when another component starts reading it (%o)', async (owner) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (children: ReactNode) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = render(wrap(<SchemaState owner={owner} label="first" />));
  await waitFor(() => expect(screen.getByText('first:error')).toBeTruthy());
  expect(failingFetch).toHaveBeenCalledTimes(1);

  // The flow canvas mounts on the error, and its nodes and log viewer read the same query. A retry on their mount
  // would put the query back to pending, unmount the canvas again and loop for as long as the request fails.
  await act(async () => {
    view.rerender(
      wrap(
        <>
          <SchemaState owner={owner} label="first" />
          <SchemaState owner={owner} label="second" />
        </>,
      ),
    );
  });
  expect(screen.getByText('first:error')).toBeTruthy();
  expect(screen.getByText('second:error')).toBeTruthy();
  expect(failingFetch).toHaveBeenCalledTimes(1);
});
