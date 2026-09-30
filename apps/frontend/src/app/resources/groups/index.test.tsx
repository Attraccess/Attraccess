import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ManageResourceGroups } from './index';
const state = vi.hoisted(() => ({
  add: vi.fn(),
  remove: vi.fn(),
  error: vi.fn(),
  groups: [
    { id: 1, name: 'Printers', description: 'Additive manufacturing' },
    { id: 2, name: 'Workshop', description: '' },
  ],
}));
vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceGetAllResourcesKey: 'resources',
  UseResourcesServiceGetOneResourceByIdKeyFn: ({ id }: { id: number }) => ['resource', id],
  useResourcesServiceGetOneResourceById: ({ id }: { id: number }) =>
    useQuery({
      queryKey: ['resource', id],
      staleTime: Infinity,
      queryFn: () => Promise.resolve({ id, name: 'Printer', groups: [state.groups[0]] }),
    }),
  useResourcesServiceResourceGroupsGetMany: () => ({ data: state.groups }),
  useResourcesServiceResourceGroupsAddResource: () => ({ mutateAsync: state.add }),
  useResourcesServiceResourceGroupsRemoveResource: () => ({ mutateAsync: state.remove }),
}));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ error: state.error }) }));
vi.mock('../../resource-groups/upsertModal/resourceGroupUpsertModal', () => ({
  ResourceGroupUpsertModal: ({
    children,
    onUpserted,
  }: {
    children: (open: () => void) => ReactNode;
    onUpserted: (group: { id: number; name: string }) => void;
  }) => children(() => onUpserted({ id: 3, name: 'New lab' })),
}));
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  state.add.mockResolvedValue(undefined);
  state.remove.mockResolvedValue(undefined);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['resource', 7], { id: 7, name: 'Printer', groups: [state.groups[0]] });
});
afterEach(() => {
  cleanup();
  client.clear();
});
function mount(hideHeader = false) {
  return render(
    <QueryClientProvider client={client}>
      <ManageResourceGroups resourceId={7} hideHeader={hideHeader} />
    </QueryClientProvider>,
  );
}
it('optimistically adds membership, locks the pending row and invalidates both resource queries', async () => {
  let resolve!: () => void;
  state.add.mockImplementation(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Add Printer to Workshop' }));
  expect(state.add).toHaveBeenCalledWith({ groupId: 2, resourceId: 7 });
  expect(client.getQueryData(['resource', 7])).toMatchObject({ groups: [{ id: 1 }, { id: 2 }] });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Printer from Workshop' })).toBeDisabled());
  await act(async () => resolve());
  await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Printer from Workshop' })).not.toBeDisabled());
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['resources'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['resource', 7] });
  expect(screen.getByRole('link', { name: 'open: Workshop' })).toHaveAttribute('href', '/resource-groups/2');
});
it('removes existing membership and restores the previous cache on a rejected change', async () => {
  vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
  mount(true);
  fireEvent.click(screen.getByRole('button', { name: 'Remove Printer from Printers' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add Printer to Printers' })).not.toBeDisabled());
  expect(state.remove).toHaveBeenCalledWith({ groupId: 1, resourceId: 7 });
  expect(client.getQueryData(['resource', 7])).toMatchObject({ groups: [] });
  state.add.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Add Printer to Workshop' }));
  await waitFor(() =>
    expect(state.error).toHaveBeenCalledWith({ title: 'Could not update group membership. Please try again.' }),
  );
  expect(client.getQueryData(['resource', 7])).toMatchObject({ groups: [] });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add Printer to Workshop' })).not.toBeDisabled());
});
it('filters and searches groups and assigns a newly created group', async () => {
  vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Available · 1' }));
  expect(screen.queryByText('Printers')).toBeNull();
  expect(screen.getByText('Workshop')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Assigned · 1' }));
  expect(screen.queryByText('Workshop')).toBeNull();
  expect(screen.getByText('Printers')).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText('Search groups…'), { target: { value: 'unknown' } });
  expect(await screen.findByText('No groups match your search.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'New group' }));
  await waitFor(() => expect(state.add).toHaveBeenCalledWith({ groupId: 3, resourceId: 7 }));
  expect(client.getQueryData(['resource', 7])).toMatchObject({ groups: [{ id: 1 }, { id: 3 }] });
});
