import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { KioskResourcePage } from './resources/KioskResourcePage';
import { KioskCompanionPage } from './companion/KioskCompanionPage';
import { KioskLayout } from './layout/KioskLayout';
const state = vi.hoisted(() => ({
  authenticated: true,
  initialized: true,
  loading: false,
  error: false,
  resource: undefined as undefined | { id: number; name: string; description?: string },
  resources: [] as { id: number; name: string }[],
  query: vi.fn(),
  logout: vi.fn(),
  countdown: vi.fn(),
  remaining: 15 as number | null,
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: state.authenticated, isInitialized: state.initialized, logout: state.logout }),
}));
vi.mock('./login/KioskLogin', () => ({ KioskLogin: () => <div>Kiosk login</div> }));
vi.mock('../resources/details/overview/ResourceOverviewTab', () => ({
  ResourceOverviewTab: () => <div>Resource controls</div>,
}));
vi.mock('../../components/ResourceImage', () => ({
  ResourceImage: ({ name }: { name: string }) => <span>{name} image</span>,
}));
vi.mock('../../components/ResourceListItem', () => ({
  ResourceListItem: ({ resource, onPress }: { resource: { name: string }; onPress: () => void }) => (
    <button onClick={onPress}>{resource.name}</button>
  ),
}));
vi.mock('./hooks/useAutoLogoff', () => ({
  useAutoLogoff: (seconds: number | null) => {
    state.countdown(seconds);
    return { remaining: state.remaining };
  },
}));
vi.mock('./KioskScreensaver', () => ({
  KioskScreensaver: ({ enabled }: { enabled: boolean }) => (enabled ? <div>Screensaver enabled</div> : null),
}));
vi.mock('../../components/themeToggle', () => ({ ThemeToggle: () => <button>Theme</button> }));
vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceGetOneResourceById: () => ({ data: state.resource, isLoading: state.loading }),
  useCompanionDevicesServiceGetCompanionDeviceResources: (...args: unknown[]) => {
    state.query(...args);
    return { data: state.resources, isLoading: state.loading, error: state.error };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.authenticated = true;
  state.initialized = true;
  state.loading = false;
  state.error = false;
  state.resource = { id: 7, name: 'Laser', description: 'Workshop laser' };
  state.resources = [];
  state.remaining = 15;
});
afterEach(cleanup);
function Location() {
  return (
    <output>
      {useLocation().pathname}
      {useLocation().search}
    </output>
  );
}
function open(path = '/kiosk/resources/7') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Location />
      <Routes>
        <Route path="/kiosk/resources/:id" element={<KioskResourcePage />} />
        <Route path="/kiosk/companion" element={<KioskCompanionPage />} />
        <Route path="*" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
it('redirects invalid resource ids and gates resource controls on initialized authentication', () => {
  const invalid = open('/kiosk/resources/invalid');
  expect(screen.getByText('Home')).toBeTruthy();
  invalid.unmount();
  state.initialized = false;
  const loading = open();
  expect(screen.queryByText('Resource controls')).toBeNull();
  expect(screen.queryByText('Kiosk login')).toBeNull();
  loading.unmount();
  state.initialized = true;
  state.authenticated = false;
  open();
  expect(screen.getByText('Kiosk login')).toBeTruthy();
  expect(screen.queryByText('Resource controls')).toBeNull();
});
it('handles missing resources and navigates back with companion and logoff parameters', () => {
  state.resource = undefined;
  const missing = open();
  expect(screen.getByText('notFound')).toBeTruthy();
  missing.unmount();
  state.resource = { id: 7, name: 'Laser', description: 'Workshop laser' };
  open('/kiosk/resources/7?deviceId=4&autoLogoff=30');
  expect(screen.getByRole('heading', { name: 'Laser' })).toBeTruthy();
  expect(screen.getByText('Workshop laser')).toBeTruthy();
  expect(screen.getByText('Resource controls')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'backToResources' }));
  expect(screen.getByRole('status')).toHaveTextContent('/kiosk/companion?deviceId=4&autoLogoff=30');
});
it('handles missing companion identifiers, loading, errors and empty assignments', () => {
  const missing = open('/kiosk/companion');
  expect(screen.getByText('noDeviceId')).toBeTruthy();
  expect(state.query).toHaveBeenCalledWith({ id: 0 }, undefined, { enabled: false, refetchInterval: 10000 });
  missing.unmount();
  state.loading = true;
  const loading = open('/kiosk/companion?deviceId=4');
  expect(screen.queryByText('empty.title')).toBeNull();
  loading.unmount();
  state.loading = false;
  state.error = true;
  const error = open('/kiosk/companion?deviceId=4');
  expect(screen.getByText('loadError')).toBeTruthy();
  error.unmount();
  state.error = false;
  open('/kiosk/companion?deviceId=4');
  expect(screen.getByText('empty.title')).toBeTruthy();
});
it.each(['', '&autoLogoff=30'])('opens assigned resources while preserving kiosk parameters %s', (suffix) => {
  state.resources = [{ id: 7, name: 'Laser' }];
  open(`/kiosk/companion?deviceId=4${suffix}`);
  fireEvent.click(screen.getByRole('button', { name: 'Laser' }));
  expect(screen.getByRole('status')).toHaveTextContent(`/kiosk/resources/7?deviceId=4${suffix}`);
});
it('shows the auto-logoff countdown and explicit sign-out only for authenticated users', () => {
  const view = render(
    <MemoryRouter initialEntries={['/?autoLogoff=30']}>
      <KioskLayout>Contents</KioskLayout>
    </MemoryRouter>,
  );
  expect(state.countdown).toHaveBeenCalledWith(30);
  expect(screen.getByRole('progressbar', { name: 'Auto sign-out countdown' })).toHaveAttribute('aria-valuenow', '50');
  fireEvent.click(screen.getByRole('button', { name: 'signOut' }));
  expect(state.logout).toHaveBeenCalledOnce();
  view.unmount();
  state.authenticated = false;
  state.remaining = null;
  render(
    <MemoryRouter initialEntries={['/?autoLogoff=30']}>
      <KioskLayout>Contents</KioskLayout>
    </MemoryRouter>,
  );
  expect(state.countdown).toHaveBeenLastCalledWith(null);
  expect(screen.queryByRole('button', { name: 'signOut' })).toBeNull();
  expect(screen.getByText('Screensaver enabled')).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
});
