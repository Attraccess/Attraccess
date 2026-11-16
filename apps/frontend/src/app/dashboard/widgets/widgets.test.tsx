import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AttractapService, BillingService, MessagingService, ResourcesService } from '@attraccess/react-query-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BalanceWidget } from './BalanceWidget';
import { MessagesUnreadChip, MessagesWidget } from './MessagesWidget';
import { MySessionsWidget } from './MySessionsWidget';
import { ReadersWidget } from './ReadersWidget';
import { ResourcesWidget } from './ResourcesWidget';
import { UsersWidget } from './UsersWidget';

const state = vi.hoisted(() => ({
  permissions: new Set<string>(),
  openable: new Set<string>(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 7 }, hasPermission: (permission: string) => state.permissions.has(permission) }),
}));
vi.mock('./access', () => ({ useCanOpenPage: () => (path: string) => state.openable.has(path) }));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.toastSuccess, error: state.toastError }),
}));
vi.mock('../../resourceOverview/createResourceDrawer', () => ({
  CreateResourceDrawer: ({ isOpen }: { isOpen: boolean }) =>
    isOpen && <div role="dialog" aria-label="Create resource" />,
}));
vi.mock('../../user-management/invite-user-modal/index', () => ({
  InviteUserModal: ({ children }: { children: (onOpen: () => void) => ReactNode }) => (
    <>{children(() => state.toastSuccess('invite opened'))}</>
  ),
}));
vi.mock('../../resources/usage/components/SessionTimer', () => ({
  SessionTimer: ({ startTime }: { startTime: string }) => <span>Running since {startTime}</span>,
}));

function CurrentUrl() {
  const { pathname, search } = useLocation();
  return <output aria-label="Current URL">{pathname + search}</output>;
}

function renderWidget(widget: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={widget} />
          <Route path="*" element={<CurrentUrl />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const hrefs = () => screen.getAllByRole('link').map((link) => link.getAttribute('href'));

beforeEach(() => {
  state.permissions = new Set();
  state.openable = new Set(['/resources']);
  state.toastSuccess.mockReset();
  state.toastError.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MessagesWidget', () => {
  const conversation = (id: number, unreadCount = 0) => ({
    id,
    otherParticipant: { id: id + 100, username: `user${id}` },
    otherParticipantOnline: id === 1,
    lastMessage: { content: `Hello ${id}`, createdAt: '2026-11-16T08:00:00.000Z' },
    updatedAt: '2026-11-16T08:00:00.000Z',
    unreadCount,
  });

  it('links the five latest conversations to their threads, with their unread counts', async () => {
    vi.spyOn(MessagingService, 'messagingListConversations').mockResolvedValue(
      [1, 2, 3, 4, 5, 6].map((id) => conversation(id, id === 2 ? 4 : 0)) as never,
    );
    renderWidget(<MessagesWidget />);

    expect(await screen.findByText('Hello 1')).toBeInTheDocument();
    expect(screen.queryByText('Hello 6')).toBeNull();
    expect(hrefs()).toEqual([1, 2, 3, 4, 5].map((id) => `/messages?conversation=${id}`).concat('/messages'));
    expect(screen.getByLabelText('4 unread')).toHaveTextContent('4');
    expect(screen.getByRole('img', { name: 'Online' })).toBeInTheDocument();
  });

  it('shows the empty and the error state', async () => {
    const list = vi.spyOn(MessagingService, 'messagingListConversations').mockResolvedValue([] as never);
    const { unmount } = renderWidget(<MessagesWidget />);
    expect(await screen.findByText('No conversations yet.')).toBeInTheDocument();
    unmount();

    list.mockRejectedValue(new Error('offline') as never);
    renderWidget(<MessagesWidget />);
    expect(await screen.findByText('This widget could not be loaded.')).toBeInTheDocument();
  });

  it('shows the total unread count in its header', async () => {
    vi.spyOn(MessagingService, 'messagingGetUnreadCount').mockResolvedValue({ total: 120 } as never);
    renderWidget(<MessagesUnreadChip />);
    expect(await screen.findByLabelText('120 unread')).toHaveTextContent('99+');
  });
});

describe('ResourcesWidget', () => {
  it('opens the resource overview with the search term', async () => {
    renderWidget(<ResourcesWidget />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search resources' }), 'Laser cutter{Enter}');
    expect(await screen.findByRole('status', { name: 'Current URL' })).toHaveTextContent('/resources?q=Laser%20cutter');
  });

  it('shows only the links and actions the user may use', async () => {
    const { unmount } = renderWidget(<ResourcesWidget />);
    expect(hrefs()).toEqual(['/resources']);
    expect(screen.queryByRole('button', { name: 'Create resource' })).toBeNull();
    unmount();

    state.openable = new Set([
      '/resources',
      '/devices/flows',
      '/devices/mqtt/servers',
      '/attractap/readers',
      '/csv-export',
    ]);
    state.permissions = new Set(['resources.create']);
    renderWidget(<ResourcesWidget />);
    expect(hrefs()).toEqual([
      '/resources',
      '/devices/flows',
      '/devices/mqtt/servers',
      '/attractap/readers',
      '/csv-export',
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Create resource' }));
    expect(screen.getByRole('dialog', { name: 'Create resource' })).toBeInTheDocument();
  });
});

describe('UsersWidget', () => {
  it('opens the user list with the search term', async () => {
    renderWidget(<UsersWidget />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search users' }), 'ada');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('status', { name: 'Current URL' })).toHaveTextContent('/users?q=ada');
  });

  it('links the unverified filter and gates roles and invitations', async () => {
    const { unmount } = renderWidget(<UsersWidget />);
    expect(hrefs()).toEqual(['/users', '/users?emailVerified=false']);
    expect(screen.queryByRole('button', { name: 'Invite user' })).toBeNull();
    unmount();

    state.openable.add('/settings/roles');
    state.permissions = new Set(['users.create']);
    renderWidget(<UsersWidget />);
    expect(hrefs()).toContain('/settings/roles');
    await userEvent.click(screen.getByRole('button', { name: 'Invite user' }));
    expect(state.toastSuccess).toHaveBeenCalledWith('invite opened');
  });
});

describe('MySessionsWidget', () => {
  it('lists running sessions and stops one after confirmation', async () => {
    vi.spyOn(ResourcesService, 'getAllResources').mockResolvedValue({
      data: [{ id: 5, name: 'Lathe' }],
      total: 1,
    } as never);
    const active = { usages: [{ id: 31, userId: 7, startTime: '2026-11-16T08:00:00.000Z' }] };
    vi.spyOn(ResourcesService, 'resourceUsageGetActiveSession').mockResolvedValue(active as never);
    const end = vi.spyOn(ResourcesService, 'resourceUsageEndSession').mockResolvedValue({ resourceId: 5 } as never);
    renderWidget(<MySessionsWidget />);

    expect(await screen.findByRole('link', { name: 'Lathe' })).toHaveAttribute('href', '/resources/5');
    expect(await screen.findByText('Running since 2026-11-16T08:00:00.000Z')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop your session at Lathe' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Stop your session?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop' }));

    await waitFor(() => expect(end).toHaveBeenCalledWith({ resourceId: 5, requestBody: { usageId: 31 } }));
    expect(state.toastSuccess).toHaveBeenCalledWith({ title: 'Your session at Lathe was stopped.' });
  });

  it('tells the user when the session could not be stopped', async () => {
    vi.spyOn(ResourcesService, 'getAllResources').mockResolvedValue({
      data: [{ id: 5, name: 'Lathe' }],
      total: 1,
    } as never);
    vi.spyOn(ResourcesService, 'resourceUsageGetActiveSession').mockResolvedValue({
      usages: [{ id: 31, userId: 7, startTime: '2026-11-16T08:00:00.000Z' }],
    } as never);
    vi.spyOn(ResourcesService, 'resourceUsageEndSession').mockRejectedValue(new Error('offline') as never);
    renderWidget(<MySessionsWidget />);

    await userEvent.click(await screen.findByRole('button', { name: 'Stop your session at Lathe' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Stop your session?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop' }));

    await waitFor(() => expect(state.toastError).toHaveBeenCalled());
  });

  it('points to the resources when no session runs', async () => {
    vi.spyOn(ResourcesService, 'getAllResources').mockResolvedValue({ data: [], total: 0 } as never);
    renderWidget(<MySessionsWidget />);
    expect(await screen.findByText('No session running.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse resources' })).toHaveAttribute('href', '/resources');
  });
});

describe('BalanceWidget', () => {
  it('shows the own balance in the configured currency and links to billing', async () => {
    vi.spyOn(BillingService, 'getBillingConfiguration').mockResolvedValue({ currency: 'EUR', minorUnit: 2 } as never);
    const balance = vi.spyOn(BillingService, 'getBillingBalance').mockResolvedValue({ value: 1250 } as never);
    renderWidget(<BalanceWidget />);

    expect(await screen.findByText(/EUR/)).toHaveTextContent(/12[.,]5 EUR/);
    expect(balance).toHaveBeenCalledWith({ userId: 7 });
    expect(hrefs()).toEqual(['/billing', '/billing']);
  });

  it('shows an error when the balance cannot be loaded', async () => {
    vi.spyOn(BillingService, 'getBillingConfiguration').mockResolvedValue({ currency: 'EUR', minorUnit: 2 } as never);
    vi.spyOn(BillingService, 'getBillingBalance').mockRejectedValue(new Error('offline') as never);
    renderWidget(<BalanceWidget />);
    expect(await screen.findByText('This widget could not be loaded.')).toBeInTheDocument();
  });
});

describe('ReadersWidget', () => {
  it('counts paired and stale readers like the readers page and links the stale ones', async () => {
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
    vi.spyOn(AttractapService, 'getReaders').mockResolvedValue([
      { id: 1, name: 'Door', pairingState: 'paired', lastConnection: hoursAgo(1) },
      { id: 2, name: 'Lathe reader', pairingState: 'paired', lastConnection: hoursAgo(30) },
      { id: 3, name: 'New reader', pairingState: 'unpaired', lastConnection: hoursAgo(90) },
    ] as never);
    const { container } = renderWidget(<ReadersWidget />);

    expect(await screen.findByRole('link', { name: 'Lathe reader' })).toHaveAttribute(
      'href',
      '/attractap/readers/2/diagnostics',
    );
    expect(container.querySelector('[data-cy="dashboard-readers-paired"]')).toHaveTextContent('2');
    expect(container.querySelector('[data-cy="dashboard-readers-stale"]')).toHaveTextContent('1');
    expect(screen.queryByText('New reader')).toBeNull();
  });

  it('says so when every reader connected lately', async () => {
    vi.spyOn(AttractapService, 'getReaders').mockResolvedValue([] as never);
    renderWidget(<ReadersWidget />);
    expect(await screen.findByText('Every reader connected within the last 24 hours.')).toBeInTheDocument();
  });
});
