import type { PropsWithChildren } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './app';
const state = vi.hoisted(() => ({
  authenticated: false,
  setup: false,
  twoFactorLoading: false,
  liveUserId: undefined as number | undefined,
  initialized: false,
  touch: false,
  ptr: true,
  invalidate: vi.fn(),
  sync: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    isInitialized: state.initialized,
    isAuthenticated: state.authenticated,
    needsTwoFactorSetup: state.setup,
    isTwoFactorStatusLoading: state.twoFactorLoading,
    user: state.authenticated ? { id: 1 } : null,
    hasPermission: () => true,
    hasPermissionKey: () => true,
  }),
}));
vi.mock('../utils/live-updates', () => ({
  LiveUpdatesProvider: ({ userId, children }: PropsWithChildren<{ userId?: number }>) => {
    state.liveUserId = userId;
    return children;
  },
}));
vi.mock('../hooks/useLocaleSync', () => ({ useLocaleSync: state.sync }));
vi.mock('../stores/ptr.store', () => ({ usePtrStore: () => ({ pullToRefreshIsEnabled: state.ptr }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', () => ({
  client: { setConfig: () => undefined, interceptors: { request: { use: () => 0 } } },
}));
vi.mock('./routes', () => ({ useAllRoutes: () => [{ path: '/', element: <p>Home route</p>, authRequired: false }] }));
vi.mock('./layout/layout', () => ({ Layout: ({ children }: PropsWithChildren) => <main>{children}</main> }));
vi.mock('../components/toastProvider', () => ({ ToastProvider: ({ children }: PropsWithChildren) => children }));
vi.mock('../components/attraccessUserActionsBridge', () => ({
  AttraccessUserActionsBridge: ({ children }: PropsWithChildren) => children,
}));
vi.mock('../components/supervisorApproval/SupervisorApprovalListener', () => ({
  SupervisorApprovalListener: () => <p>Supervisor listener</p>,
}));
vi.mock('./billing/sessionSummary', () => ({
  SessionBillingSummary: () => <p>Session billing listener</p>,
}));
vi.mock('./mass-introduction/MassIntroductionRedeemModal', () => ({ MassIntroductionRedeemModal: () => null }));
vi.mock('../components/themeToggle', () => ({ ThemeToggle: () => <button>Theme</button> }));
vi.mock('../components/bootScreen', () => ({ BootScreen: () => <p>Starting app</p> }));
vi.mock('./unauthorized/unauthorized', () => ({ Unauthorized: () => <p>Sign in</p> }));
vi.mock('./unauthorized/unauthorized-layout/layout', () => ({
  UnauthorizedLayout: ({ children }: PropsWithChildren) => <div data-testid="unauthorized-layout">{children}</div>,
}));
vi.mock('./verify-email', () => ({ VerifyEmail: () => <p>Verify email page</p> }));
vi.mock('./reset-password/resetPassword', () => ({ ResetPassword: () => null }));
vi.mock('./accept-invitation', () => ({ AcceptInvitation: () => null }));
vi.mock('./two-factor-gate', () => ({ TwoFactorGate: ({ children }: PropsWithChildren) => children }));
vi.mock('./kiosk/KioskGuard', () => ({ KioskGuard: () => null }));
vi.mock('./dashboard/pinnablePages', () => ({
  PinnablePagesProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock('./dashboard/widgets/DashboardWidgetsProvider', () => ({
  DashboardWidgetsProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock('./dashboard/DashboardPinToggle', () => ({ DashboardPinHeaderAccessory: () => null }));
vi.mock('./not-found', () => ({ NotFound: () => <p>Not found</p> }));
vi.mock('../pwa-install', () => ({
  InstallAppButton: () => <button>Install app</button>,
  InstallAppPrompts: () => <p>Install prompts</p>,
}));
vi.mock('../components/pullToRefresh', () => ({
  PullToRefresh: ({ children, onRefresh }: PropsWithChildren<{ onRefresh: () => void }>) => (
    <>
      <button onClick={onRefresh}>Refresh gesture</button>
      {children}
    </>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.authenticated = false;
  state.setup = false;
  state.twoFactorLoading = false;
  state.liveUserId = undefined;
  state.initialized = false;
  state.touch = false;
  state.ptr = true;
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: state.touch,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: state.add,
    removeEventListener: state.remove,
    dispatchEvent: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('shows boot and theme controls before initialization, then routes the authenticated app', () => {
  const view = render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByText('Starting app')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Theme' })).toBeInTheDocument();
  expect(screen.queryByText('Supervisor listener')).toBeNull();
  expect(screen.queryByText('Session billing listener')).toBeNull();
  view.unmount();
  state.initialized = true;
  state.authenticated = true;
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByText('Home route')).toBeInTheDocument();
  expect(screen.getByText('Supervisor listener')).toBeInTheDocument();
  expect(screen.getByText('Session billing listener')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Theme' })).toBeNull();
  expect(state.sync).toHaveBeenCalled();
});
it('renders /verify-email inside the unauthorized layout so its actions stay scrollable on small phones', () => {
  state.initialized = true;
  render(
    <MemoryRouter initialEntries={['/verify-email?token=t&email=a%40b.c']}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByTestId('unauthorized-layout')).toContainElement(screen.getByText('Verify email page'));
});
it('allows theme switching during two-factor setup and refreshes queries only for touch devices', () => {
  state.authenticated = true;
  state.setup = true;
  state.touch = true;
  const view = render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByRole('button', { name: 'Theme' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh gesture' }));
  expect(state.invalidate).toHaveBeenCalledWith();
  const handler = state.add.mock.calls.find(([event]) => event === 'change')?.[1];
  act(() => handler({ matches: false }));
  expect(screen.queryByRole('button', { name: 'Refresh gesture' })).toBeNull();
  view.unmount();
  expect(state.remove).toHaveBeenCalledWith('change', handler);
});
it('respects a disabled pull-to-refresh preference on touch devices', () => {
  state.touch = true;
  state.ptr = false;
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('button', { name: 'Refresh gesture' })).toBeNull();
});

it('waits for two-factor status and required setup before enabling the live transport', () => {
  state.authenticated = true;
  state.initialized = true;
  state.twoFactorLoading = true;
  const app = (
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );
  const view = render(app);
  expect(state.liveUserId).toBeUndefined();
  state.twoFactorLoading = false;
  state.setup = true;
  view.rerender(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(state.liveUserId).toBeUndefined();
  state.setup = false;
  view.rerender(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(state.liveUserId).toBe(1);
});

it('offers the install action next to the theme toggle when signed out, but not in kiosk mode', () => {
  const view = render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByRole('button', { name: 'Install app' })).toBeInTheDocument();
  expect(screen.getByText('Install prompts')).toBeInTheDocument();
  view.unmount();

  render(
    <MemoryRouter initialEntries={['/kiosk/resources/1']}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByRole('button', { name: 'Theme' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull();
  expect(screen.queryByText('Install prompts')).toBeNull();
});

it('keeps the install action out of the signed-in shell, which offers it in the user menu', () => {
  state.initialized = true;
  state.authenticated = true;
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull();
  expect(screen.getByText('Install prompts')).toBeInTheDocument();
});
