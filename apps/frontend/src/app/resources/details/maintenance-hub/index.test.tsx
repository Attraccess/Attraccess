import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MaintenanceHubPage } from './index';
const state = vi.hoisted(() => ({
  resource: undefined as undefined | { name: string; type: string },
  loading: false,
  error: false,
  allowed: true,
  maintenances: [] as { id: number; startTime: string; endTime?: string }[],
  live: [] as { id: number }[],
  upcoming: [] as { id: number }[],
  history: [] as { id: number }[],
  drawer: {} as {
    isOpen: boolean;
    resourceId: number;
    supportsOperatingDuration: boolean;
    scheduleId?: number;
    onClose: () => void;
  },
  create: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useResourcesServiceGetOneResourceById: () => ({ data: state.resource, isLoading: state.loading, error: state.error }),
  useResourceMaintenancesServiceCanManageMaintenance: () => ({ data: { canManage: state.allowed } }),
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedules: () => ({ data: [] }),
  useResourceMaintenancesServiceFindMaintenances: () => ({ data: { data: state.maintenances } }),
}));
vi.mock('../../../../hooks/useNow', () => ({ useNow: () => new Date('2026-09-01T12:00:00Z') }));
vi.mock('./stat-strip', () => ({ StatStrip: () => null }));
vi.mock('./requests-section', () => ({ RequestsSection: () => null }));
vi.mock('./live-section', () => ({
  LiveSection: ({ liveMaintenances }: { liveMaintenances: typeof state.live }) => {
    state.live = liveMaintenances;
    return <div>Live maintenance</div>;
  },
}));
vi.mock('./upcoming-section', () => ({
  UpcomingSection: ({ upcomingMaintenances }: { upcomingMaintenances: typeof state.upcoming }) => {
    state.upcoming = upcomingMaintenances;
    return null;
  },
}));
vi.mock('./history-section', () => ({
  HistorySection: ({ pastMaintenances }: { pastMaintenances: typeof state.history }) => {
    state.history = pastMaintenances;
    return null;
  },
}));
vi.mock('./schedules-tab', () => ({
  SchedulesTab: ({ onEdit }: { onEdit: (id: number) => void }) => (
    <button onClick={() => onEdit(4)}>Edit schedule</button>
  ),
}));
vi.mock('./schedule-form-drawer', () => ({
  ScheduleFormDrawer: (props: typeof state.drawer) => {
    state.drawer = props;
    return props.isOpen ? <button onClick={props.onClose}>Close schedule</button> : null;
  },
}));
vi.mock('../maintenance-management/upsert', () => ({
  ResourceMaintenanceUpsertModal: ({ children }: { children: (open: () => void) => ReactNode }) =>
    children(state.create),
}));
function Location() {
  return <output>{useLocation().pathname}</output>;
}
function show() {
  return render(
    <MemoryRouter initialEntries={['/resources/7/maintenance']}>
      <Location />
      <Routes>
        <Route path="/resources/:id/maintenance" element={<MaintenanceHubPage />} />
        <Route path="*" element={<div>Destination</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    resource: { name: 'Lathe', type: 'machine' },
    loading: false,
    error: false,
    allowed: true,
    maintenances: [],
    live: [],
    upcoming: [],
    history: [],
  });
});
afterEach(cleanup);
it('waits for the resource and provides a return route when it is missing', () => {
  state.loading = true;
  const view = show();
  expect(screen.queryByText('Live maintenance')).toBeNull();
  view.unmount();
  state.loading = false;
  state.resource = undefined;
  show();
  expect(screen.getByText('errors.resourceNotFound')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'errors.backToResources' }));
  expect(screen.getByText('/resources')).toBeTruthy();
});
it('blocks maintenance management without permission', () => {
  state.allowed = false;
  show();
  expect(screen.getByText('errors.forbidden')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.backToResource' }));
  expect(screen.getByText('/resources/7')).toBeTruthy();
});
it('partitions live, future and historical work and sorts upcoming and past work', () => {
  state.maintenances = [
    { id: 1, startTime: '2026-09-01T11:00:00Z' },
    { id: 2, startTime: '2026-09-01T10:00:00Z', endTime: '2026-09-01T13:00:00Z' },
    { id: 3, startTime: '2026-09-03T10:00:00Z' },
    { id: 4, startTime: '2026-09-02T10:00:00Z' },
    { id: 5, startTime: '2026-08-01T10:00:00Z', endTime: '2026-08-01T11:00:00Z' },
    { id: 6, startTime: '2026-08-31T10:00:00Z', endTime: '2026-09-01T12:00:00Z' },
  ];
  show();
  expect(state.live.map((m) => m.id)).toEqual([1, 2]);
  expect(state.upcoming.map((m) => m.id)).toEqual([4, 3]);
  expect(state.history.map((m) => m.id)).toEqual([6, 5]);
});
it('opens creation and editing with the correct resource and operating-duration capability', () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'activity.actions.create' }));
  expect(state.create).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'actions.newSchedule' }));
  expect(state.drawer).toMatchObject({
    isOpen: true,
    resourceId: 7,
    supportsOperatingDuration: true,
    scheduleId: undefined,
  });
  fireEvent.click(screen.getByText('Close schedule'));
  expect(state.drawer.isOpen).toBe(false);
  fireEvent.click(screen.getByText('Edit schedule'));
  expect(state.drawer).toMatchObject({ isOpen: true, scheduleId: 4 });
});
