import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MaintenanceManagement } from './index';
import { ResourceMaintenanceUpsertModal } from './upsert';
import { RequestMaintenanceButton } from './request';
const state = vi.hoisted(() => ({
  now: new Date('2026-09-01T10:00:00.000Z'),
  rows: [] as unknown[],
  query: vi.fn(),
  create: vi.fn(),
  request: vi.fn(),
  reset: vi.fn(),
  done: vi.fn(),
  invalidate: vi.fn(),
  error: undefined as Error | undefined,
  licensed: true,
  manager: false,
  callbacks: {} as Record<string, { onSuccess: () => void }>,
}));
vi.mock('../../../../hooks/useNow', () => ({ useNow: () => state.now }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useResourceMaintenancesServiceFindMaintenances: (...args: unknown[]) => {
    state.query(...args);
    return { data: { data: state.rows } };
  },
  useResourceMaintenancesServiceFindMaintenancesKey: 'maintenances',
  useResourceMaintenancesServiceListMaintenanceRequestsKey: 'requests',
  useResourceMaintenancesServiceCreateMaintenance: (callbacks: (typeof state.callbacks)[string]) => {
    state.callbacks.create = callbacks;
    return { mutate: state.create, isPending: false, error: state.error };
  },
  useResourceMaintenancesServiceCreateMaintenanceRequest: (callbacks: (typeof state.callbacks)[string]) => {
    state.callbacks.request = callbacks;
    return { mutate: state.request, isPending: false, error: state.error, reset: state.reset };
  },
  useLicenseServiceGetLicenseInformation: () => ({ data: { modules: state.licensed ? ['maintenance'] : [] } }),
  useResourceMaintenancesServiceCanManageMaintenance: () => ({ data: { canManage: state.manager } }),
}));
vi.mock('./mark-done', () => ({
  MarkDoneModal: ({ children, maintenanceId }: { children: (open: () => void) => ReactNode; maintenanceId: number }) =>
    children(() => state.done(maintenanceId)),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [
    {
      id: 1,
      startTime: '2026-08-31T10:00:00Z',
      endTime: null,
      reason: 'Active repair',
      createdByUser: { username: 'Technician' },
    },
    {
      id: 2,
      startTime: '2026-08-01T10:00:00Z',
      endTime: '2026-08-02T10:00:00Z',
      reason: 'Completed repair',
      completedByUser: { username: 'Maintainer' },
      completedAt: '2026-08-02T10:00:00Z',
    },
    { id: 3, startTime: '2026-09-02T10:00:00Z', endTime: '2026-09-03T10:00:00Z', reason: 'Future service' },
  ];
  state.error = undefined;
  state.licensed = true;
  state.manager = false;
  state.callbacks = {};
});
afterEach(cleanup);
it.each(['card', 'flat'] as const)(
  'renders active, past and upcoming maintenance in %s mode and filters history',
  async (variant) => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<MaintenanceManagement resourceId={7} variant={variant} />} />
          <Route path="/resources/7/maintenance" element={<p>Maintenance hub</p>} />
        </Routes>
      </MemoryRouter>,
    );
    for (const reason of ['Active repair', 'Completed repair', 'Future service'])
      expect(screen.getByText(reason)).toBeTruthy();
    expect(state.query).toHaveBeenCalledWith(
      { resourceId: 7, includePast: false, includeActive: true, includeUpcoming: true },
      undefined,
      { refetchInterval: 10000 },
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Include past' }));
    expect(state.query).toHaveBeenLastCalledWith(
      { resourceId: 7, includePast: true, includeActive: true, includeUpcoming: true },
      undefined,
      { refetchInterval: 10000 },
    );
    const active = screen.getByText('Active repair').closest(variant === 'flat' ? 'li' : 'tr');
    expect(active).toBeTruthy();
    const complete = active?.querySelector('button');
    expect(complete).toBeTruthy();
    fireEvent.click(complete!);
    expect(state.done).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Manage maintenance' }));
    expect(await screen.findByText('Maintenance hub')).toBeTruthy();
  },
);
it.each([false, true])('creates a maintenance period with optional end time (%s)', async (withEnd) => {
  render(
    <MemoryRouter>
      <ResourceMaintenanceUpsertModal resourceId={7}>
        {(open) => <button onClick={open}>New period</button>}
      </ResourceMaintenanceUpsertModal>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText('New period'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Replace filter' } });
  if (withEnd) fireEvent.click(screen.getByRole('switch', { name: 'End time already known?' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(state.create).toHaveBeenCalledWith({
    resourceId: 7,
    requestBody: {
      startTime: '2026-09-01T10:00:00.000Z',
      endTime: withEnd ? '2026-09-01T10:00:00.000Z' : undefined,
      reason: 'Replace filter',
    },
  });
  act(() => state.callbacks.create.onSuccess());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['maintenances'] });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it('validates requests, trims the reason and resets after success closes', async () => {
  render(<RequestMaintenanceButton resourceId={7} />);
  fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));
  const reason = screen.getByPlaceholderText('e.g. The emergency stop button is stuck');
  fireEvent.change(reason, { target: { value: ' x ' } });
  expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
  fireEvent.change(reason, { target: { value: '  Emergency stop stuck  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
  expect(state.request).toHaveBeenCalledWith({ resourceId: 7, requestBody: { reason: 'Emergency stop stuck' } });
  act(() => state.callbacks.request.onSuccess());
  expect(screen.getByText('Thanks for the heads-up')).toBeTruthy();
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['requests'] });
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(state.reset).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));
  expect(screen.getByPlaceholderText('e.g. The emergency stop button is stuck')).toHaveValue('');
});
it('gates reports by license and management access, and supports custom triggers and request errors', () => {
  state.licensed = false;
  let view = render(<RequestMaintenanceButton resourceId={7} />);
  expect(screen.queryByRole('button')).toBeNull();
  view.unmount();
  state.licensed = true;
  state.manager = true;
  view = render(<RequestMaintenanceButton resourceId={7} />);
  expect(screen.queryByRole('button')).toBeNull();
  view.unmount();
  state.manager = false;
  state.error = new Error('Unavailable');
  render(
    <RequestMaintenanceButton resourceId={7}>
      {(open) => <button onClick={open}>Report issue</button>}
    </RequestMaintenanceButton>,
  );
  fireEvent.click(screen.getByText('Report issue'));
  expect(screen.getByText('Unavailable')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(state.request).not.toHaveBeenCalled();
  expect(state.reset).toHaveBeenCalledOnce();
});
