import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ResourceFlowsService, type ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useNodePreviewRows } from './index';

const node = vi.hoisted(() => ({ id: 'node' as string | null, data: { value: true } as Record<string, unknown> }));
vi.mock('@xyflow/react', () => ({
  useNodeId: () => node.id,
  useNodesData: () => (node.id ? { id: node.id, data: node.data } : null),
}));
const schema: ResourceFlowNodeSchemaDto = {
  type: 'plugin.example.command',
  inputs: ['input'],
  outputs: ['output'],
  isInput: false,
  isOutput: true,
  supportedByResource: true,
  configSchema: { dynamic: true, properties: {}, preview: [] },
};
let client: QueryClient;
const pending: Array<{ resolve: (schema: ResourceFlowNodeSchemaDto) => void; reject: (error: Error) => void }> = [];
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  node.id = 'node';
  node.data = { value: true };
  pending.length = 0;
  vi.spyOn(ResourceFlowsService, 'resolveNodeSchema').mockImplementation(
    () =>
      new Promise<ResourceFlowNodeSchemaDto>((resolve, reject) => pending.push({ resolve, reject })) as ReturnType<
        typeof ResourceFlowsService.resolveNodeSchema
      >,
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});
function mount(currentSchema = schema) {
  return renderHook(
    () => useNodePreviewRows({ schema: currentSchema, tNodeTranslations: (key) => key, resourceId: 6 }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
}
function response(value: string): ResourceFlowNodeSchemaDto {
  return { ...schema, configSchema: { ...schema.configSchema, preview: [{ label: 'Action', value }] } };
}

it('resolves saved configuration and never displays a late response for a previous selection', async () => {
  const { result, rerender } = mount();
  await waitFor(() => expect(pending).toHaveLength(1));
  expect(ResourceFlowsService.resolveNodeSchema).toHaveBeenCalledWith({
    resourceId: 6,
    nodeType: schema.type,
    requestBody: { config: { value: true } },
  });
  node.data = { value: false };
  rerender();
  await waitFor(() => expect(pending).toHaveLength(2));
  expect(result.current).toEqual([{ label: 'preview.configuration', value: 'preview.loading' }]);
  await act(async () => pending[1].resolve(response('Turn OFF')));
  await waitFor(() => expect(result.current).toEqual([{ label: 'Action', value: 'Turn OFF' }]));
  await act(async () => pending[0].resolve(response('Turn ON')));
  expect(result.current).toEqual([{ label: 'Action', value: 'Turn OFF' }]);
  node.data = { value: false, channelId: 'another-channel' };
  rerender();
  expect(result.current).toEqual([{ label: 'preview.configuration', value: 'preview.loading' }]);
});

it('shows an unavailable summary after a failed refresh instead of stale resolved names', async () => {
  const { result } = mount();
  await waitFor(() => expect(pending).toHaveLength(1));
  await act(async () => pending[0].resolve(response('Turn ON')));
  await waitFor(() => expect(result.current[0]).toEqual({ label: 'Action', value: 'Turn ON' }));
  act(() => {
    void client.invalidateQueries({ queryKey: ['flow-node-preview'] });
  });
  await waitFor(() => expect(pending).toHaveLength(2));
  await act(async () => pending[1].reject(new Error('unavailable')));
  await waitFor(() =>
    expect(result.current).toEqual([{ label: 'preview.configuration', value: 'preview.unavailable' }]),
  );
});

it('does not resolve catalog cards or plugins that did not opt in', () => {
  node.id = null;
  const catalog = mount();
  expect(catalog.result.current).toEqual([]);
  catalog.unmount();
  node.id = 'node';
  mount({ ...schema, configSchema: { dynamic: true, properties: {} } });
  expect(ResourceFlowsService.resolveNodeSchema).not.toHaveBeenCalled();
});
