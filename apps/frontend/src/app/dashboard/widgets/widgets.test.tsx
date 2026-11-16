import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  AttractapService,
  BillingService,
  MessagingService,
  ResourcesService,
  UsersService,
} from '@attraccess/react-query-client';
import type { DashboardWidgetSize } from '@attraccess/plugins-frontend-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BalanceWidget } from './BalanceWidget';
import { BUILT_IN_WIDGETS } from './builtInWidgets';
import { BUILT_IN_WIDGET_IDS } from './ids';
import { MessagesUnreadChip, MessagesWidget } from './MessagesWidget';
import { MySessionsWidget } from './MySessionsWidget';
import { ReadersWidget } from './ReadersWidget';
import { ResourcesInUseWidget } from './ResourcesInUseWidget';
import { ResourcesWidget } from './ResourcesWidget';
import { UnverifiedUsersChip, UsersWidget } from './UsersWidget';

const state = vi.hoisted(() => ({
  permissions: new Set<string>(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 7 }, hasPermission: (permission: string) => state.permissions.has(permission) }),
}));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.toastSuccess, error: state.toastError }),
}));
vi.mock('../../resourceOverview/createResourceDrawer', () => ({
  CreateResourceDrawer: ({ isOpen }: { isOpen: boolean }) =>
    isOpen && <div role="dialog" aria-label="Create resource" />,
}));
vi.mock('../../resourceOverview/resourceGroupCard/statusChip', () => ({
  StatusChip: ({ resourceId }: { resourceId: number }) => <span>Status {resourceId}</span>,
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

const at = (size: DashboardWidgetSize) => ({ size, isPreview: false });
const hrefs = () => screen.getAllByRole('link').map((link) => link.getAttribute('href'));
const ids = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

beforeEach(() => {
  state.permissions = new Set();
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
  const listConversations = (count: number) =>
    vi
      .spyOn(MessagingService, 'messagingListConversations')
      .mockResolvedValue(ids(count).map((id) => conversation(id, id === 2 ? 4 : 0)) as never);

  it.each([
    ['medium', 3],
    ['large', 7],
  ] as const)('links the %s number of latest conversations to their threads', async (size, count) => {
    listConversations(9);
    renderWidget(<MessagesWidget {...at(size)} />);

    expect(await screen.findByText('Hello 1')).toBeInTheDocument();
    expect(hrefs()).toEqual(ids(count).map((id) => `/messages?conversation=${id}`));
    expect(screen.getByText('4 unread').parentElement).toHaveTextContent(/^4/);
    expect(screen.getByRole('img', { name: 'Online' })).toBeInTheDocument();
  });

  it('shows the unread count and the latest sender on a small tile', async () => {
    listConversations(2);
    vi.spyOn(MessagingService, 'messagingGetUnreadCount').mockResolvedValue({ total: 12 } as never);
    const { container } = renderWidget(<MessagesWidget {...at('small')} />);

    expect(await screen.findByText('Latest from user1')).toBeInTheDocument();
    await waitFor(() =>
      expect(container.querySelector('[data-cy="dashboard-messages-unread"]')).toHaveTextContent('12'),
    );
    expect(screen.queryByText('Hello 1')).toBeNull();
  });

  it('names who last wrote to the user, not whom the user last replied to', async () => {
    const replied = { ...conversation(1), lastMessage: { ...conversation(1).lastMessage, senderId: 7 } };
    vi.spyOn(MessagingService, 'messagingListConversations').mockResolvedValue([replied, conversation(2)] as never);
    renderWidget(<MessagesWidget {...at('small')} />);

    expect(await screen.findByText('Latest from user2')).toBeInTheDocument();
  });

  it('shows the empty and the error state', async () => {
    const list = vi.spyOn(MessagingService, 'messagingListConversations').mockResolvedValue([] as never);
    const { unmount } = renderWidget(<MessagesWidget {...at('medium')} />);
    expect(await screen.findByText('No conversations yet.')).toBeInTheDocument();
    unmount();

    list.mockRejectedValue(new Error('offline') as never);
    renderWidget(<MessagesWidget {...at('medium')} />);
    expect(await screen.findByText('This widget could not be loaded.')).toBeInTheDocument();
  });

  it('shows the total unread count in its header, except on a small tile', async () => {
    vi.spyOn(MessagingService, 'messagingGetUnreadCount').mockResolvedValue({ total: 120 } as never);
    const { unmount } = renderWidget(<MessagesUnreadChip {...at('medium')} />);
    expect((await screen.findByText('120 unread')).parentElement).toHaveTextContent(/^99\+/);
    unmount();

    const { container } = renderWidget(<MessagesUnreadChip {...at('small')} />);
    await waitFor(() => expect(MessagingService.messagingGetUnreadCount).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });
});

describe('MySessionsWidget', () => {
  const resources = (count: number) => ids(count).map((id) => ({ id, name: `Machine ${id}` }));
  function runSessions(count: number) {
    vi.spyOn(ResourcesService, 'getAllResources').mockResolvedValue({
      data: resources(count),
      total: count,
    } as never);
    vi.spyOn(ResourcesService, 'resourceUsageGetActiveSession').mockImplementation((({
      resourceId,
    }: {
      resourceId: number;
    }) =>
      Promise.resolve({
        usages: [{ id: 30 + resourceId, userId: 7, startTime: `2026-11-16T08:0${resourceId % 10}:00.000Z` }],
      })) as never);
  }
  const rows = (container: HTMLElement) => container.querySelectorAll('[data-cy="dashboard-my-sessions-row"]');
  const more = (container: HTMLElement) => container.querySelector('[data-cy="dashboard-widget-more"]');

  it.each([
    ['small', 1, '+8 more'],
    ['medium', 3, null],
    ['large', 7, '+2 more'],
  ] as const)('lists the %s number of sessions', async (size, count, moreText) => {
    runSessions(9);
    const { container } = renderWidget(<MySessionsWidget {...at(size)} />);

    await screen.findByRole('link', { name: 'Machine 1' });
    expect(rows(container)).toHaveLength(count);
    if (moreText) {
      expect(more(container)).toHaveTextContent(moreText);
      expect(more(container)).toHaveAttribute('href', '/resources');
    } else {
      expect(more(container)).toBeNull();
    }
  });

  it('cuts long resource names short instead of running them under Stop', async () => {
    runSessions(1);
    renderWidget(<MySessionsWidget {...at('medium')} />);
    // HeroUI links are as wide as their text; only a block capped at the row's width can end in an ellipsis.
    expect(await screen.findByRole('link', { name: 'Machine 1' })).toHaveClass('block', 'max-w-full', 'truncate');
  });

  it('names Stop after its resource, and shows only the icon on a small tile', async () => {
    runSessions(1);
    renderWidget(<MySessionsWidget {...at('small')} />);
    const stop = await screen.findByRole('button', { name: 'Stop Machine 1' });
    expect(stop).not.toHaveTextContent('Stop');
  });

  it('lists running sessions and stops one after confirmation', async () => {
    runSessions(1);
    const end = vi.spyOn(ResourcesService, 'resourceUsageEndSession').mockResolvedValue({ resourceId: 1 } as never);
    renderWidget(<MySessionsWidget {...at('medium')} />);

    expect(await screen.findByRole('link', { name: 'Machine 1' })).toHaveAttribute('href', '/resources/1');
    expect(await screen.findByText('Running since 2026-11-16T08:01:00.000Z')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop Machine 1' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Stop your session?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop' }));

    await waitFor(() => expect(end).toHaveBeenCalledWith({ resourceId: 1, requestBody: { usageId: 31 } }));
    expect(state.toastSuccess).toHaveBeenCalledWith({ title: 'Your session at Machine 1 was stopped.' });
  });

  it('tells the user when the session could not be stopped', async () => {
    runSessions(1);
    vi.spyOn(ResourcesService, 'resourceUsageEndSession').mockRejectedValue(new Error('offline') as never);
    renderWidget(<MySessionsWidget {...at('medium')} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Stop Machine 1' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Stop your session?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop' }));

    await waitFor(() => expect(state.toastError).toHaveBeenCalled());
  });

  it('opens no confirmation in a gallery preview', async () => {
    runSessions(1);
    renderWidget(<MySessionsWidget size="medium" isPreview />);
    await userEvent.click(await screen.findByRole('button', { name: 'Stop Machine 1' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('points to the resources when no session runs', async () => {
    vi.spyOn(ResourcesService, 'getAllResources').mockResolvedValue({ data: [], total: 0 } as never);
    renderWidget(<MySessionsWidget {...at('medium')} />);
    expect(await screen.findByText('No running sessions')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse resources' })).toHaveAttribute('href', '/resources');
  });
});

describe('ResourcesWidget', () => {
  it('shows live matches after a pause in typing, each linking to its resource', async () => {
    const list = vi.spyOn(ResourcesService, 'getAllResources').mockResolvedValue({
      data: [
        { id: 4, name: 'Laser cutter' },
        { id: 9, name: 'Laser engraver' },
      ],
      total: 2,
    } as never);
    renderWidget(<ResourcesWidget {...at('large')} />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search resources' }), 'Laser');
    expect(await screen.findByRole('link', { name: 'Laser cutter' })).toHaveAttribute('href', '/resources/4');
    expect(screen.getByText('Status 9')).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith({ search: 'Laser', limit: 7 });
    expect(list).not.toHaveBeenCalledWith(expect.objectContaining({ search: 'L' }));
  });

  it('says so when nothing matches', async () => {
    vi.spyOn(ResourcesService, 'getAllResources').mockResolvedValue({ data: [], total: 0 } as never);
    renderWidget(<ResourcesWidget {...at('medium')} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search resources' }), 'zz');
    expect(await screen.findByText('No resources match.')).toBeInTheDocument();
    expect(ResourcesService.getAllResources).toHaveBeenCalledWith({ search: 'zz', limit: 3 });
  });

  it('opens the resource overview with the term on Enter', async () => {
    vi.spyOn(ResourcesService, 'getAllResources').mockResolvedValue({ data: [], total: 0 } as never);
    renderWidget(<ResourcesWidget {...at('medium')} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search resources' }), 'Laser cutter{Enter}');
    expect(await screen.findByRole('status', { name: 'Current URL' })).toHaveTextContent('/resources?q=Laser%20cutter');
  });

  it('offers creating a resource only with resources.create', async () => {
    const { unmount } = renderWidget(<ResourcesWidget {...at('medium')} />);
    expect(screen.queryByRole('button', { name: 'Create resource' })).toBeNull();
    unmount();

    state.permissions = new Set(['resources.create']);
    renderWidget(<ResourcesWidget {...at('medium')} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create resource' }));
    expect(screen.getByRole('dialog', { name: 'Create resource' })).toBeInTheDocument();
  });
});

describe('ResourcesInUseWidget', () => {
  const inUse = (count: number) => ids(count).map((id) => ({ id, name: `Machine ${id}` }));

  it('counts the resources in use on a small tile', async () => {
    vi.spyOn(ResourcesService, 'getAllResourcesInUse').mockResolvedValue(inUse(4) as never);
    const { container } = renderWidget(<ResourcesInUseWidget {...at('small')} />);
    await waitFor(() => expect(container.querySelector('[data-cy="dashboard-in-use-count"]')).toHaveTextContent('4'));
    expect(screen.getByText('in use')).toBeInTheDocument();
  });

  it('lists who uses what, naming a user only when the API shares one', async () => {
    vi.spyOn(ResourcesService, 'getAllResourcesInUse').mockResolvedValue(inUse(5) as never);
    vi.spyOn(ResourcesService, 'resourceUsageGetActiveSession').mockImplementation((({
      resourceId,
    }: {
      resourceId: number;
    }) =>
      Promise.resolve({
        usages: [
          {
            id: resourceId,
            startTime: `2026-11-16T08:0${resourceId}:00.000Z`,
            ...(resourceId === 1 ? { user: { id: 3, username: 'ada' } } : {}),
          },
        ],
      })) as never);
    const { container } = renderWidget(<ResourcesInUseWidget {...at('medium')} />);

    expect(await screen.findByRole('link', { name: 'Machine 1' })).toHaveAttribute('href', '/resources/1');
    expect(container.querySelectorAll('[data-cy="dashboard-in-use-row"]')).toHaveLength(3);
    expect(await screen.findByText('ada')).toBeInTheDocument();
    expect(await screen.findByText('Running since 2026-11-16T08:02:00.000Z')).toBeInTheDocument();
    expect(screen.getAllByText(/^ada$/)).toHaveLength(1);
    // Long names end in an ellipsis instead of running into the timer.
    expect(screen.getByRole('link', { name: 'Machine 1' })).toHaveClass('block', 'max-w-full', 'truncate');
  });

  it('says so when nothing is in use', async () => {
    vi.spyOn(ResourcesService, 'getAllResourcesInUse').mockResolvedValue([] as never);
    renderWidget(<ResourcesInUseWidget {...at('medium')} />);
    expect(await screen.findByText('Nothing is in use right now.')).toBeInTheDocument();
  });
});

describe('UsersWidget', () => {
  it('shows live matches linking to each user', async () => {
    const find = vi.spyOn(UsersService, 'findMany').mockResolvedValue({
      data: [{ id: 12, username: 'ada' }],
      total: 1,
    } as never);
    renderWidget(<UsersWidget {...at('medium')} />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search users' }), 'ada');
    expect(await screen.findByRole('link', { name: 'ada' })).toHaveAttribute('href', '/users/12');
    expect(find).toHaveBeenCalledWith({ search: 'ada', limit: 3 });
  });

  it('opens the user list with the term on Enter', async () => {
    vi.spyOn(UsersService, 'findMany').mockResolvedValue({ data: [], total: 0 } as never);
    renderWidget(<UsersWidget {...at('medium')} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search users' }), 'ada{Enter}');
    expect(await screen.findByRole('status', { name: 'Current URL' })).toHaveTextContent('/users?q=ada');
  });

  it('offers invitations only with users.create', async () => {
    const { unmount } = renderWidget(<UsersWidget {...at('medium')} />);
    expect(screen.queryByRole('button', { name: 'Invite user' })).toBeNull();
    unmount();

    state.permissions = new Set(['users.create']);
    renderWidget(<UsersWidget {...at('medium')} />);
    await userEvent.click(screen.getByRole('button', { name: 'Invite user' }));
    expect(state.toastSuccess).toHaveBeenCalledWith('invite opened');
  });

  it('links the unverified users only while there are any', async () => {
    const find = vi.spyOn(UsersService, 'findMany').mockResolvedValue({ data: [], total: 0 } as never);
    const { container, unmount } = renderWidget(<UnverifiedUsersChip isEditing={false} />);
    await waitFor(() => expect(find).toHaveBeenCalledWith({ emailVerified: false, limit: 1 }));
    expect(container).toBeEmptyDOMElement();
    unmount();

    find.mockResolvedValue({ data: [{ id: 1 }], total: 4 } as never);
    const { unmount: unmountLink } = renderWidget(<UnverifiedUsersChip isEditing={false} />);
    expect(await screen.findByRole('link', { name: '4 unverified' })).toHaveAttribute(
      'href',
      '/users?emailVerified=false',
    );
    unmountLink();

    // While editing, the chip is no link that could leave the dashboard.
    renderWidget(<UnverifiedUsersChip isEditing />);
    expect(await screen.findByText('4 unverified')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('BalanceWidget', () => {
  const configure = (value: number) => {
    vi.spyOn(BillingService, 'getBillingConfiguration').mockResolvedValue({ currency: 'EUR', minorUnit: 2 } as never);
    return vi.spyOn(BillingService, 'getBillingBalance').mockResolvedValue({ value } as never);
  };

  it('shows the own balance in the configured currency on a small tile', async () => {
    const balance = configure(1250);
    const transactions = vi.spyOn(BillingService, 'getBillingTransactions');
    const { container } = renderWidget(<BalanceWidget {...at('small')} />);

    expect(await screen.findByText(/EUR/)).toHaveTextContent(/12[.,]5 EUR/);
    expect(balance).toHaveBeenCalledWith({ userId: 7 });
    expect(container.querySelector('[data-cy="dashboard-balance-value"]')).not.toHaveClass('text-danger');
    expect(transactions).not.toHaveBeenCalled();
  });

  it('shows a negative balance in the danger colour', async () => {
    configure(-300);
    const { container } = renderWidget(<BalanceWidget {...at('small')} />);
    await screen.findByText(/EUR/);
    expect(container.querySelector('[data-cy="dashboard-balance-value"]')).toHaveClass('text-danger');
  });

  it('adds the last three transactions on a medium tile', async () => {
    configure(1250);
    const transactions = vi.spyOn(BillingService, 'getBillingTransactions').mockResolvedValue({
      data: [
        {
          id: 1,
          amount: -200,
          createdAt: '2026-11-16T08:00:00.000Z',
          resourceUsageId: 5,
          resourceUsage: { resource: { name: 'Lathe' } },
        },
        { id: 2, amount: 1000, createdAt: '2026-11-15T08:00:00.000Z', externalReference: 'sumup-1' },
        { id: 3, amount: -50, createdAt: '2026-11-14T08:00:00.000Z', initiatorId: 2 },
        { id: 4, amount: 5, createdAt: '2026-11-13T08:00:00.000Z' },
      ],
      total: 4,
    } as never);
    const { container } = renderWidget(<BalanceWidget {...at('medium')} />);

    expect(await screen.findByText('Usage of Lathe')).toBeInTheDocument();
    expect(transactions).toHaveBeenCalledWith({ userId: 7, limit: 3 });
    expect(screen.getByText('Top-up')).toBeInTheDocument();
    expect(screen.getByText('Manual transaction')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-cy="dashboard-balance-transaction"]')).toHaveLength(3);
  });

  it('shows an error when the balance cannot be loaded', async () => {
    vi.spyOn(BillingService, 'getBillingConfiguration').mockResolvedValue({ currency: 'EUR', minorUnit: 2 } as never);
    vi.spyOn(BillingService, 'getBillingBalance').mockRejectedValue(new Error('offline') as never);
    renderWidget(<BalanceWidget {...at('small')} />);
    expect(await screen.findByText('This widget could not be loaded.')).toBeInTheDocument();
  });
});

describe('ReadersWidget', () => {
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
  const offline = (container: HTMLElement) => container.querySelector('[data-cy="dashboard-readers-offline"]');

  it('says so when no reader is paired yet instead of reporting all connected', async () => {
    vi.spyOn(AttractapService, 'getReaders').mockResolvedValue([
      { id: 3, name: 'New reader', pairingState: 'unpaired', lastConnection: hoursAgo(90) },
    ] as never);
    const { container } = renderWidget(<ReadersWidget {...at('small')} />);

    expect(await screen.findByText('No paired readers yet')).toBeInTheDocument();
    expect(offline(container)).toBeNull();
  });

  it('counts stale of paired readers like the readers page, in the warning colour', async () => {
    vi.spyOn(AttractapService, 'getReaders').mockResolvedValue([
      { id: 1, name: 'Door', pairingState: 'paired', lastConnection: hoursAgo(1) },
      { id: 2, name: 'Lathe reader', pairingState: 'paired', lastConnection: hoursAgo(30) },
      { id: 3, name: 'New reader', pairingState: 'unpaired', lastConnection: hoursAgo(90) },
    ] as never);
    const { container } = renderWidget(<ReadersWidget {...at('small')} />);

    await waitFor(() => expect(offline(container)).toHaveTextContent('1/2'));
    expect(offline(container)).toHaveClass('text-warning');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('lists up to three stale readers on a medium tile, linking to their diagnostics', async () => {
    vi.spyOn(AttractapService, 'getReaders').mockResolvedValue(
      ids(4).map((id) => ({
        id,
        name: `Reader ${id}`,
        pairingState: 'paired',
        lastConnection: hoursAgo(24 + id),
      })) as never,
    );
    renderWidget(<ReadersWidget {...at('medium')} />);

    expect(await screen.findByRole('link', { name: 'Reader 1' })).toHaveAttribute(
      'href',
      '/attractap/readers/1/diagnostics',
    );
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('shows the success colour and says so when every reader connected lately', async () => {
    vi.spyOn(AttractapService, 'getReaders').mockResolvedValue([
      { id: 1, name: 'Door', pairingState: 'paired', lastConnection: hoursAgo(1) },
    ] as never);
    const { container } = renderWidget(<ReadersWidget {...at('medium')} />);
    expect(await screen.findByText('All readers connected')).toBeInTheDocument();
    expect(offline(container)).toHaveTextContent('0/1');
    expect(offline(container)).toHaveClass('text-success');
  });
});

describe('BUILT_IN_WIDGETS', () => {
  it('has one entry for each built-in id the API accepts', () => {
    expect(BUILT_IN_WIDGETS.map((widget) => widget.id).sort()).toEqual([...BUILT_IN_WIDGET_IDS].sort());
  });

  it('defaults every widget to one of its own sizes', () => {
    for (const widget of BUILT_IN_WIDGETS) expect(widget.sizes).toContain(widget.defaultSize);
  });

  it('offers the sizes and default size the requirements set per widget', () => {
    const layout = Object.fromEntries(
      BUILT_IN_WIDGETS.map(({ id, sizes, defaultSize }) => [id, { sizes: [...sizes], defaultSize }]),
    );
    expect(layout).toEqual({
      messages: { sizes: ['small', 'medium', 'large'], defaultSize: 'medium' },
      'my-sessions': { sizes: ['small', 'medium', 'large'], defaultSize: 'medium' },
      resources: { sizes: ['medium', 'large'], defaultSize: 'medium' },
      'resources-in-use': { sizes: ['small', 'medium', 'large'], defaultSize: 'medium' },
      users: { sizes: ['medium', 'large'], defaultSize: 'medium' },
      'billing-balance': { sizes: ['small', 'medium'], defaultSize: 'small' },
      readers: { sizes: ['small', 'medium'], defaultSize: 'small' },
    });
  });
});
