import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GroupDetailsForm } from './index';
const state = vi.hoisted(() => ({
  group: { name: 'Workshop', description: 'Old description', isHidden: false } as
    { name: string; description: string; isHidden: boolean } | undefined,
  loading: false,
  error: undefined as Error | undefined,
  update: vi.fn(),
  remove: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  toastError: vi.fn(),
  callbacks: {} as Record<string, { onSuccess: () => void; onError: (error: Error) => void }>,
}));
vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceResourceGroupsGetOne: () => ({ data: state.group, isLoading: state.loading, error: state.error }),
  useResourcesServiceResourceGroupsUpdateOne: (callbacks: (typeof state.callbacks)[string]) => {
    state.callbacks.update = callbacks;
    return { mutateAsync: state.update };
  },
  useResourcesServiceResourceGroupsDeleteOne: (callbacks: (typeof state.callbacks)[string]) => {
    state.callbacks.remove = callbacks;
    return { mutate: state.remove };
  },
  UseResourcesServiceResourceGroupsGetOneKeyFn: (input: unknown) => ['group', input],
  UseResourcesServiceResourceGroupsGetManyKeyFn: () => ['groups'],
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.toastError }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.group = { name: 'Workshop', description: 'Old description', isHidden: false };
  state.loading = false;
  state.error = undefined;
  state.update.mockResolvedValue(undefined);
});
afterEach(cleanup);
function mount() {
  return render(
    <MemoryRouter initialEntries={['/edit']}>
      <Routes>
        <Route path="/edit" element={<GroupDetailsForm groupId={7} />} />
        <Route path="/" element={<p>Resource list</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
it('saves trimmed details and visibility, refreshes the group and reports errors', async () => {
  mount();
  const name = screen.getByRole('textbox', { name: /Group Name/ });
  expect(name).toHaveValue('Workshop');
  fireEvent.change(name, { target: { value: '   ' } });
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
  fireEvent.change(name, { target: { value: ' New workshop ' } });
  fireEvent.change(screen.getByPlaceholderText('Enter group description (optional)'), {
    target: { value: '  New description  ' },
  });
  fireEvent.click(screen.getByRole('switch'));
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await waitFor(() =>
    expect(state.update).toHaveBeenCalledWith({
      id: 7,
      requestBody: { name: 'New workshop', description: 'New description', isHidden: true },
    }),
  );
  act(() => state.callbacks.update.onSuccess());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['group', { id: 7 }] });
  expect(state.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'Group updated successfully' }));
  act(() => state.callbacks.update.onError(new Error('Denied')));
  expect(state.toastError).toHaveBeenCalledWith(
    expect.objectContaining({ description: 'There was an error updating the group: Denied' }),
  );
  fireEvent.change(screen.getByPlaceholderText('Enter group description (optional)'), { target: { value: '  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  expect(state.update).toHaveBeenLastCalledWith({
    id: 7,
    requestBody: { name: 'New workshop', description: undefined, isHidden: true },
  });
});
it('requires delete confirmation and navigates away after success', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Delete Group' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(state.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete Group' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(state.remove).toHaveBeenCalledWith({ groupId: 7 });
  act(() => state.callbacks.remove.onError(new Error('In use')));
  expect(state.toastError).toHaveBeenCalledWith(expect.objectContaining({ title: 'Failed to delete group' }));
  act(() => state.callbacks.remove.onSuccess());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['groups'] });
  expect(await screen.findByText('Resource list')).toBeInTheDocument();
});
it.each(['loading', 'error', 'missing'])('shows the %s state without editable fields', (kind) => {
  state.loading = kind === 'loading';
  state.error = kind === 'error' ? new Error('Offline') : undefined;
  if (kind === 'missing') state.group = undefined;
  mount();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(
    screen.getByText(kind === 'loading' ? 'Loading group details...' : 'Failed to load group'),
  ).toBeInTheDocument();
});
