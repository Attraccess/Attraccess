import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Layout } from './layout';
const state = vi.hoisted(() => ({
  authenticated: true,
  needsTwoFactorSetup: false,
  invalidate: vi.fn(),
  live: {} as { enabled: boolean; onUpdate: () => void },
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 7 },
    isAuthenticated: state.authenticated,
    needsTwoFactorSetup: state.needsTwoFactorSetup,
  }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useBillingServiceGetBillingTransactionsKey: 'transactions',
  UseBillingServiceGetBillingBalanceKeyFn: ({ userId }: { userId: number }) => ['balance', userId],
}));
vi.mock('../billing/dashboard/summary/live-updates', () => ({
  useLiveTransactionUpdates: (options: typeof state.live) => {
    state.live = options;
  },
}));
vi.mock('./sidebar', () => ({
  Sidebar: ({
    isOpen,
    isCollapsed,
    toggleCollapsed,
  }: {
    isOpen: boolean;
    isCollapsed: boolean;
    toggleCollapsed: () => void;
  }) => (
    <aside>
      <span>
        Sidebar {isOpen ? 'open' : 'closed'} {isCollapsed ? 'collapsed' : 'expanded'}
      </span>
      <button onClick={toggleCollapsed}>Collapse</button>
    </aside>
  ),
}));
vi.mock('./header', () => ({
  Header: ({ toggleSidebar }: { toggleSidebar: () => void }) => <button onClick={toggleSidebar}>Menu</button>,
}));
vi.mock('../../components/DonationPrompt', () => ({ DonationPrompt: () => <div>Donation prompt</div> }));
vi.mock('../../components/UpdateNotificationBanner', () => ({
  UpdateNotificationBanner: () => <div>Update banner</div>,
}));
vi.mock('../serverNotAvailable', () => ({ ServerNotAvailable: () => <div>Server status</div> }));
vi.mock('../messaging/GlobalMessagingLive', () => ({
  GlobalMessagingLive: ({ enabled }: { enabled: boolean }) => <div>Messaging {String(enabled)}</div>,
}));
vi.mock('../notifications/GlobalSystemNotificationsLive', () => ({
  GlobalSystemNotificationsLive: ({ enabled }: { enabled: boolean }) => <div>Notifications {String(enabled)}</div>,
}));
vi.mock('../notifications/GlobalPushNotifications', () => ({
  GlobalPushNotifications: ({ enabled }: { enabled: boolean }) => <div>Push {String(enabled)}</div>,
}));
function Page() {
  const navigate = useNavigate();
  return (
    <Layout>
      <button onClick={() => navigate('/next')}>Navigate</button>
      <div>Page contents</div>
    </Layout>
  );
}
function open() {
  return render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  state.authenticated = true;
  state.needsTwoFactorSetup = false;
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1200 });
});
afterEach(cleanup);
it('renders unauthenticated content with server status and disables live subscriptions', () => {
  state.authenticated = false;
  open();
  expect(screen.getByText('Page contents')).toBeTruthy();
  expect(screen.getByText('Server status')).toBeTruthy();
  expect(screen.queryByRole('complementary')).toBeNull();
  expect(state.live.enabled).toBe(false);
});
it('persists desktop collapse, adapts to viewport changes and closes the sidebar after navigation', () => {
  const view = open();
  expect(screen.getByText('Sidebar open expanded')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
  expect(screen.getByText('Sidebar open collapsed')).toBeTruthy();
  expect(localStorage.getItem('attraccess.sidebar-collapsed')).toBe('true');
  view.unmount();
  open();
  expect(screen.getByText('Sidebar open collapsed')).toBeTruthy();
  act(() => {
    window.innerWidth = 390;
    window.dispatchEvent(new Event('resize'));
  });
  expect(screen.getByText('Sidebar closed expanded')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
  expect(screen.getByText('Sidebar open expanded')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));
  expect(screen.getByText('Sidebar closed expanded')).toBeTruthy();
});
it('refreshes billing data on live updates and gates subscriptions during two-factor setup', () => {
  const view = open();
  expect(state.live.enabled).toBe(true);
  act(() => state.live.onUpdate());
  expect(state.invalidate.mock.calls).toEqual([[{ queryKey: ['transactions'] }], [{ queryKey: ['balance', 7] }]]);
  expect(screen.getByText('Messaging true')).toBeTruthy();
  view.unmount();
  state.needsTwoFactorSetup = true;
  open();
  expect(state.live.enabled).toBe(false);
  expect(screen.getByText('Messaging false')).toBeTruthy();
  expect(screen.getByText('Notifications false')).toBeTruthy();
  expect(screen.getByText('Push false')).toBeTruthy();
});
