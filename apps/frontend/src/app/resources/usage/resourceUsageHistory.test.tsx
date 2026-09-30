import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResourceUsageHistory } from './resourceUsageHistory';
const state = vi.hoisted(() => ({
  permitted: true,
  type: 'machine',
  error: undefined as Error | undefined,
  rows: [] as unknown[],
  query: vi.fn(),
  update: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  toastError: vi.fn(),
  callbacks: undefined as
    | {
        onSuccess: (usage: unknown) => void;
        onError: (error: Error, variables: { usageId: number }) => void;
        onSettled: (data: unknown, error: unknown, variables?: { usageId: number }) => void;
      }
    | undefined,
}));
vi.mock('@attraccess/react-query-client', () => ({
  ResourceType: { MACHINE: 'machine', DOOR: 'door' },
  ResourceUsageAction: {
    USAGE: 'usage',
    DOOR_LOCK: 'door.lock',
    DOOR_UNLOCK: 'door.unlock',
    DOOR_UNLATCH: 'door.unlatch',
  },
  useResourcesServiceResourceUsageGetHistory: (...args: unknown[]) => {
    state.query(...args);
    return { data: { total: 12, data: state.rows }, error: state.error };
  },
  useResourcesServiceGetOneResourceById: () => ({ data: { id: 7, type: state.type } }),
  UseResourcesServiceResourceUsageGetHistoryKeyFn: (input: unknown) => ['history', input],
  useResourcesServiceResourceUsageUpdateSessionProject: (callbacks: typeof state.callbacks) => {
    state.callbacks = callbacks;
    return { mutate: state.update };
  },
}));
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 3 }, hasPermission: () => state.permitted }),
}));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.toastError }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../operatingDuration', () => ({
  useCanViewOperatingDuration: () => true,
  useOperatingDuration: () => ({ data: undefined }),
  attributedOperatingDurationForUsage: () => 60000,
}));
vi.mock('../../../components/projectsSelect', () => ({
  ProjectsSelect: ({
    value,
    onChange,
    isDisabled,
  }: {
    value?: number;
    onChange: (value?: number) => void;
    isDisabled: boolean;
  }) => (
    <select
      aria-label="Session project"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value ? Number(event.target.value) : undefined)}
      disabled={isDisabled}
    >
      <option value="">Unassigned</option>
      <option value="4">Old project</option>
      <option value="5">New project</option>
    </select>
  ),
}));
vi.mock('./components/UsageNotesModal', () => ({
  UsageNotesModal: ({
    isOpen,
    onClose,
    session,
    operatingDurationMs,
  }: {
    isOpen: boolean;
    onClose: () => void;
    session: { id: number } | null;
    operatingDurationMs: number;
  }) =>
    isOpen ? (
      <div role="dialog">
        Session {session?.id}, operating {operatingDurationMs}
        <button onClick={onClose}>Close notes</button>
      </div>
    ) : null,
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.permitted = true;
  state.type = 'machine';
  state.error = undefined;
  state.rows = [
    {
      id: 11,
      resourceId: 7,
      userId: 3,
      user: { id: 3, username: 'Alice' },
      usageAction: 'usage',
      startTime: '2026-09-01T10:00:00Z',
      endTime: '2026-09-01T11:00:00Z',
      usageInMinutes: 60,
      project: { id: 4, name: 'Old project' },
      startNotes: 'Clean before use',
    },
    {
      id: 12,
      userId: 8,
      user: { id: 8, username: 'Bob' },
      usageAction: 'usage',
      startTime: '2026-09-02T10:00:00Z',
      endTime: null,
      usageInMinutes: -1,
      project: { id: 4, name: 'Other project' },
    },
    { id: 13, usageAction: 'door.lock', startTime: '2026-09-03T10:00:00Z' },
  ];
});
afterEach(cleanup);
it('optimistically updates projects, rolls back failures and refreshes matching history queries', async () => {
  render(
    <MemoryRouter>
      <ResourceUsageHistory resourceId={7} />
    </MemoryRouter>,
  );
  const project = screen.getByRole('combobox', { name: 'Session project' });
  expect(project).toHaveValue('4');
  fireEvent.change(project, { target: { value: '4' } });
  expect(state.update).not.toHaveBeenCalled();
  fireEvent.change(project, { target: { value: '5' } });
  expect(state.update).toHaveBeenCalledWith({ resourceId: 7, usageId: 11, requestBody: { projectId: 5 } });
  expect(project).toHaveValue('5');
  expect(project).toBeDisabled();
  act(() => {
    state.callbacks?.onError(new Error('Offline'), { usageId: 11 });
    state.callbacks?.onSettled(undefined, undefined, { usageId: 11 });
  });
  expect(project).toHaveValue('4');
  expect(project).toBeEnabled();
  expect(state.toastError).toHaveBeenCalledWith({ title: 'Project update failed' });
  fireEvent.change(project, { target: { value: '' } });
  expect(state.update).toHaveBeenLastCalledWith({ resourceId: 7, usageId: 11, requestBody: { projectId: null } });
  act(() => {
    state.callbacks?.onSuccess({ id: 11, project: null });
    state.callbacks?.onSettled(undefined, undefined, { usageId: 11 });
  });
  expect(project).toHaveValue('');
  expect(state.success).toHaveBeenCalledWith({ title: 'Project updated' });
  const predicate = state.invalidate.mock.calls[0][0].predicate;
  expect(predicate({ queryKey: ['history', { resourceId: 7, page: 2 }] })).toBe(true);
  expect(predicate({ queryKey: ['history', { resourceId: 8 }] })).toBe(false);
  expect(predicate({ queryKey: ['other', { resourceId: 7 }] })).toBe(false);
  expect(predicate({ queryKey: ['history'] })).toBe(false);
  act(() => state.callbacks?.onSettled(undefined, undefined));
});
it('filters users, paginates and opens session notes from the real history table', async () => {
  render(
    <MemoryRouter>
      <ResourceUsageHistory resourceId={7} hideHeader />
    </MemoryRouter>,
  );
  expect(state.query).toHaveBeenCalledWith({ resourceId: 7, page: 1, limit: 5, userId: 3 }, undefined, {
    enabled: true,
  });
  fireEvent.click(screen.getByRole('switch'));
  expect(state.query).toHaveBeenLastCalledWith({ resourceId: 7, page: 1, limit: 5, userId: undefined }, undefined, {
    enabled: true,
  });
  fireEvent.click(screen.getByRole('button', { name: '2' }));
  expect(state.query).toHaveBeenLastCalledWith({ resourceId: 7, page: 2, limit: 5, userId: undefined }, undefined, {
    enabled: true,
  });
  expect(screen.queryByText('Locked')).toBeNull();
  expect(screen.getByText('Other project')).toBeInTheDocument();
  const row = screen.getByRole('combobox').closest('tr')!;
  fireEvent.click(row);
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Session 11, operating 60000'));
  fireEvent.click(screen.getByText('Close notes'));
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('shows only door actions for doors and gates the all-users filter', () => {
  state.type = 'door';
  state.permitted = false;
  render(
    <MemoryRouter>
      <ResourceUsageHistory resourceId={7} />
    </MemoryRouter>,
  );
  expect(screen.getByText('Locked')).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.queryByRole('switch')).toBeNull();
});
it('reports history loading errors', () => {
  state.error = new Error('Offline');
  render(
    <MemoryRouter>
      <ResourceUsageHistory resourceId={7} />
    </MemoryRouter>,
  );
  expect(screen.getByText('Error loading usage history. Please try again.')).toBeInTheDocument();
});
