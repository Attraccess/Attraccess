import { FLOW_NODE_PREVIEW_QUERY_KEY } from '@attraccess/plugins-frontend-sdk';
import { expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useConfigurationActions } from '../src/queries';

vi.mock('../src/api', () => ({
  publishConfiguration: vi.fn().mockResolvedValue({ revision: 2 }),
  rollbackConfiguration: vi.fn().mockResolvedValue({ revision: 3 }),
}));

it('invalidates cached canvas previews after publication and rollback', async () => {
  const client = new QueryClient();
  const key = [...FLOW_NODE_PREVIEW_QUERY_KEY, 6, 'plugin.wago.command', { controllerId: 7 }];
  const { result, unmount } = renderHook(() => useConfigurationActions(7), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  client.setQueryData(key, { preview: [{ label: 'Channel', value: 'Old name' }] });
  await act(async () => {
    await result.current.publish.mutateAsync({ force: false, reviewedHash: 'reviewed' });
  });
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  client.setQueryData(key, { preview: [{ label: 'Channel', value: 'New name' }] });
  await act(async () => {
    await result.current.rollback.mutateAsync({
      revision: 1,
      force: false,
      sourceHash: 'source',
      currentHash: 'current',
      draftHash: 'draft',
    });
  });
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  unmount();
  client.clear();
});
