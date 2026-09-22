import type { PropsWithChildren } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './app';
const state = vi.hoisted(() => ({
  authenticated: false,
  setup: false,
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
    user: state.authenticated ? { id: 1 } : null,
    hasPermission: () => true,
  }),
}));
vi.mock('../hooks/useLocaleSync', () => ({ useLocaleSync: state.sync }));
vi.mock('../stores/ptr.store', () => ({ usePtrStore: () => ({ pullToRefreshIsEnabled: state.ptr }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', () => ({ OpenAPI: {} }));
vi.mock('./routes', () => ({ useAllRoutes: () => [{ path: '/', element: <p>Home route</p>, authRequired: false }] }));
vi.mock('./layout/layout', () => ({ Layout: ({ children }: PropsWithChildren) => <main>{children}</main> }));
vi.mock('../components/toastProvider', () => ({ ToastProvider: ({ children }: PropsWithChildren) => children }));
vi.mock('../components/attraccessUserActionsBridge', () => ({
  AttraccessUserActionsBridge: ({ children }: PropsWithChildren) => children,
}));
vi.mock('../components/supervisorApproval/SupervisorApprovalListener', () => ({
  SupervisorApprovalListener: () => <p>Supervisor listener</p>,
}));
vi.mock('../components/themeToggle', () => ({ ThemeToggle: () => <button>Theme</button> }));
vi.mock('../components/bootScreen', () => ({ BootScreen: () => <p>Starting app</p> }));
vi.mock('./unauthorized/unauthorized', () => ({ Unauthorized: () => <p>Sign in</p> }));
vi.mock('./unauthorized/unauthorized-layout/layout', () => ({
  UnauthorizedLayout: ({ children }: PropsWithChildren) => children,
}));
vi.mock('./verify-email', () => ({ VerifyEmail: () => null }));
vi.mock('./reset-password/resetPassword', () => ({ ResetPassword: () => null }));
vi.mock('./accept-invitation', () => ({ AcceptInvitation: () => null }));
vi.mock('./two-factor-gate', () => ({ TwoFactorGate: ({ children }: PropsWithChildren) => children }));
vi.mock('./kiosk/KioskGuard', () => ({ KioskGuard: () => null }));
vi.mock('./not-found', () => ({ NotFound: () => <p>Not found</p> }));
vi.mock('react-simple-pull-to-refresh', () => ({
  default: ({ children, onRefresh }: PropsWithChildren<{ onRefresh: () => void }>) => (
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
  expect(screen.queryByRole('button', { name: 'Theme' })).toBeNull();
  expect(state.sync).toHaveBeenCalled();
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
