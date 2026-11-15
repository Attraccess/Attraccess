import '@testing-library/jest-dom/vitest';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PropsWithChildren } from 'react';
import {
  DashboardPinDto,
  DashboardPinItemType,
  DashboardService,
  ResourcesService,
  UseDashboardServiceDashboardGetPinsKeyFn,
} from '@attraccess/react-query-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardLanding, DashboardPage } from './index';
import { DashboardPinHeaderAccessory, DashboardPinToggle } from './DashboardPinToggle';
import { DashboardPinTargetContext, resourcePinTarget } from './pinTarget';
import { PageHeader, PageHeaderAccessoryProvider } from '@attraccess/plugins-frontend-ui';
import { useDragAccessibility, usePinReorder } from './DashboardGrid';
import { useDashboardPins } from './pins';
import { PinnablePages } from './pinnablePagesContext';

const state = vi.hoisted(() => ({
  pinnable: null as unknown as PinnablePages,
  toastError: vi.fn(),
}));

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTranslations: ({ en }: { en: Record<string, unknown> }) => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en);
      if (typeof value !== 'string') return key;
      return value.replace(/{{(\w+)}}/g, (_, name: string) => String(vars?.[name] ?? ''));
    },
  }),
}));
vi.mock('../../components/toastProvider', () => ({ useToastMessage: () => ({ error: state.toastError }) }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 7 }, hasPermission: () => true }) }));
vi.mock('./pinnablePagesContext', () => ({ usePinnablePages: () => state.pinnable }));
vi.mock('../resources/usage/components/ResourceUsageSession', () => ({
  ResourceUsageSession: ({ resourceId }: { resourceId: number }) => <div>Session controls {resourceId}</div>,
}));
vi.mock('../resourceOverview/resourceGroupCard/statusChip', () => ({
  StatusChip: ({ resourceId }: { resourceId: number }) => <div>Status {resourceId}</div>,
}));

const page = (itemId: string): DashboardPinDto => ({ itemType: DashboardPinItemType.PAGE, itemId });
const projects = { path: '/projects', title: 'Projects', icon: null };
const messages = { path: '/messages', title: 'Messages', icon: null, badgeCount: 3 };

let client: QueryClient;

function CurrentUrl() {
  const { pathname, search, hash } = useLocation();
  return <output aria-label="Current URL">{pathname + search + hash}</output>;
}

function renderAt(path: string, element: React.ReactNode) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={element} />
          <Route path="/dashboard" element={element} />
          <Route path="/resources" element={<CurrentUrl />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const getPins = () => vi.spyOn(DashboardService, 'dashboardGetPins');
const updatePins = () => vi.spyOn(DashboardService, 'dashboardUpdatePins');

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  state.pinnable = { pages: [projects, messages], titleOf: () => undefined, isReady: true };
  state.toastError.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DashboardLanding', () => {
  it.each([
    ['/', '/resources'],
    ['/?enroll=K7P-3XQ#top', '/resources?enroll=K7P-3XQ#top'],
  ])('sends a user without pins from %s to %s', async (from, to) => {
    getPins().mockResolvedValue([] as never);
    renderAt(from, <DashboardLanding />);

    expect(await screen.findByRole('status', { name: 'Current URL' })).toHaveTextContent(to);
  });

  it('shows a spinner, never the redirect, while the pins load', () => {
    getPins().mockReturnValue(new Promise(() => undefined) as never);
    const { container } = renderAt('/?enroll=K7P', <DashboardLanding />);

    expect(container.querySelector('[data-cy="dashboard-loading"]')).not.toBeNull();
    expect(screen.queryByRole('status', { name: 'Current URL' })).toBeNull();
  });

  it('keeps the dashboard when the last pin is removed on the start page', async () => {
    getPins().mockResolvedValue([page('/projects')] as never);
    updatePins().mockResolvedValue([] as never);
    renderAt('/', <DashboardLanding />);

    await userEvent.click(await screen.findByRole('button', { name: 'Remove Projects from dashboard' }));

    expect(await screen.findByRole('heading', { name: 'Nothing pinned yet' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Current URL' })).toBeNull();
  });

  it('shows the dashboard to a user with pins', async () => {
    getPins().mockResolvedValue([page('/projects')] as never);
    renderAt('/', <DashboardLanding />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Projects/ })).toHaveAttribute('href', '/projects');
    expect(screen.queryByRole('status', { name: 'Current URL' })).toBeNull();
  });

  it('offers a retry instead of redirecting when the pins cannot be loaded', async () => {
    const pins = getPins().mockRejectedValue(new Error('offline') as never);
    renderAt('/', <DashboardLanding />);

    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByText('Could not load your dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Current URL' })).toBeNull();
    pins.mockResolvedValue([page('/projects')] as never);
    await userEvent.click(retry);

    expect(await screen.findByRole('link', { name: /Projects/ })).toBeInTheDocument();
  });
});

describe('DashboardPage', () => {
  it('explains how to pin and links to the resources when nothing is pinned', async () => {
    getPins().mockResolvedValue([] as never);
    renderAt('/dashboard', <DashboardPage />);

    expect(await screen.findByRole('heading', { name: 'Nothing pinned yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse resources' })).toHaveAttribute('href', '/resources');
  });

  it('shows page cards with their badge in the stored order', async () => {
    getPins().mockResolvedValue([page('/messages'), page('/projects')] as never);
    renderAt('/dashboard', <DashboardPage />);

    const links = await screen.findAllByRole('link', { name: /Messages|Projects/ });
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/messages', '/projects']);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows a removable placeholder for a page the user can no longer open', async () => {
    state.pinnable = { pages: [projects], titleOf: (path) => (path === '/users' ? 'Users' : undefined), isReady: true };
    getPins().mockResolvedValue([page('/users'), page('/uninstalled-plugin')] as never);
    const update = updatePins().mockResolvedValue([page('/uninstalled-plugin')] as never);
    renderAt('/dashboard', <DashboardPage />);

    expect(await screen.findByText('Users')).toBeInTheDocument();
    expect(screen.getByText('/uninstalled-plugin')).toBeInTheDocument();
    expect(screen.getAllByText('No longer accessible')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Remove Users from dashboard' }));

    expect(update).toHaveBeenCalledWith({ requestBody: { kind: 'remove', item: page('/users') } });
    await waitFor(() => expect(screen.queryByText('Users')).toBeNull());
  });

  it('keeps the cards when a later refetch fails', async () => {
    const pins = getPins().mockResolvedValue([page('/projects')] as never);
    renderAt('/dashboard', <DashboardPage />);
    expect(await screen.findByRole('link', { name: /Projects/ })).toBeInTheDocument();

    pins.mockRejectedValue(new Error('offline') as never);
    await act(() => client.refetchQueries({ queryKey: UseDashboardServiceDashboardGetPinsKeyFn() }));

    expect(screen.getByRole('link', { name: /Projects/ })).toBeInTheDocument();
    expect(screen.queryByText('Could not load your dashboard')).toBeNull();
  });

  it('waits for the plugins before calling a page inaccessible', async () => {
    state.pinnable = { pages: [], titleOf: () => undefined, isReady: false };
    getPins().mockResolvedValue([page('/plugin-report')] as never);
    renderAt('/dashboard', <DashboardPage />);

    expect(await screen.findByText('/plugin-report')).toBeInTheDocument();
    expect(screen.queryByText('No longer accessible')).toBeNull();
  });

  it('shows a resource with its status, session controls and a link to its page', async () => {
    getPins().mockResolvedValue([
      { itemType: DashboardPinItemType.RESOURCE, itemId: '5', resourceName: 'Lathe' },
    ] as never);
    vi.spyOn(ResourcesService, 'getOneResourceById').mockResolvedValue({ id: 5, name: 'Lathe' } as never);
    vi.spyOn(ResourcesService, 'resourceUsageGetActiveSession').mockResolvedValue({ usage: null } as never);
    renderAt('/dashboard', <DashboardPage />);

    const card = (await screen.findByRole('heading', { name: 'Lathe' })).closest('[data-cy="dashboard-card"]');
    expect(within(card as HTMLElement).getByText('Status 5')).toBeInTheDocument();
    expect(await within(card as HTMLElement).findByText('Session controls 5')).toBeInTheDocument();
    expect(within(card as HTMLElement).getByRole('link', { name: 'Open Lathe' })).toHaveAttribute(
      'href',
      '/resources/5',
    );
  });
});

it('tells the user when a pinned resource cannot be loaded', async () => {
  getPins().mockResolvedValue([{ itemType: DashboardPinItemType.RESOURCE, itemId: '5', resourceName: 'Lathe' }] as never);
  vi.spyOn(ResourcesService, 'getOneResourceById').mockRejectedValue(new Error('gone') as never);
  vi.spyOn(ResourcesService, 'resourceUsageGetActiveSession').mockResolvedValue({ usage: null } as never);
  renderAt('/dashboard', <DashboardPage />);

  expect(await screen.findByText('This resource could not be loaded.')).toBeInTheDocument();
});

describe('DashboardPinToggle', () => {
  function renderToggle() {
    return render(
      <QueryClientProvider client={client}>
        <DashboardPinToggle item={page('/projects')} />
      </QueryClientProvider>,
    );
  }

  it('stays disabled until the pins have loaded', async () => {
    getPins().mockRejectedValue(new Error('offline') as never);
    renderToggle();

    const toggle = screen.getByRole('button', { name: 'Pin to dashboard' });
    expect(toggle).toBeDisabled();
    await waitFor(() => expect(DashboardService.dashboardGetPins).toHaveBeenCalled());
    expect(toggle).toBeDisabled();
  });

  it('pins and unpins the page', async () => {
    getPins().mockResolvedValue([] as never);
    const update = updatePins()
      .mockResolvedValueOnce([page('/projects')] as never)
      .mockResolvedValueOnce([] as never);
    renderToggle();

    const toggle = await screen.findByRole('button', { name: 'Pin to dashboard' });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);

    const pinned = await screen.findByRole('button', { name: 'Unpin from dashboard' });
    expect(pinned).toHaveAttribute('aria-pressed', 'true');
    expect(update).toHaveBeenLastCalledWith({ requestBody: { kind: 'add', item: page('/projects') } });
    await waitFor(() => expect(pinned).toBeEnabled());
    await userEvent.click(pinned);

    expect(await screen.findByRole('button', { name: 'Pin to dashboard' })).toBeInTheDocument();
    expect(update).toHaveBeenLastCalledWith({ requestBody: { kind: 'remove', item: page('/projects') } });
  });

  it('tells the user when the pin could not be saved', async () => {
    getPins().mockResolvedValue([] as never);
    updatePins().mockRejectedValue(new Error('offline') as never);
    renderToggle();

    const toggle = await screen.findByRole('button', { name: 'Pin to dashboard' });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);

    await waitFor(() =>
      expect(state.toastError).toHaveBeenCalledWith({ title: 'Your dashboard could not be saved. Please try again.' }),
    );
  });
});

describe('DashboardPinHeaderAccessory', () => {
  function renderHeaderAt(path: string, header: React.ReactNode = <PageHeader title="Page" />) {
    getPins().mockResolvedValue([] as never);
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <PageHeaderAccessoryProvider accessory={DashboardPinHeaderAccessory}>
            <Routes>
              <Route
                path="*"
                element={
                  <>
                    {header}
                    <PageHeader title="Section" noMargin />
                  </>
                }
              />
            </Routes>
          </PageHeaderAccessoryProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('offers one pin toggle on a pinnable page', async () => {
    renderHeaderAt('/projects');
    expect(await screen.findAllByRole('button', { name: 'Pin to dashboard' })).toHaveLength(1);
  });

  it.each(['/dashboard', '/', '/kiosk/companion', '/projects/4'])('offers no pin toggle on %s', async (path) => {
    renderHeaderAt(path);
    expect(await screen.findByRole('heading', { name: 'Page' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pin to dashboard' })).toBeNull();
    expect(DashboardService.dashboardGetPins).not.toHaveBeenCalled();
  });

  it('pins the resource of a resource page', async () => {
    const update = updatePins().mockResolvedValue([] as never);
    renderHeaderAt(
      '/resources/5/history',
      <DashboardPinTargetContext.Provider value={resourcePinTarget(5)}>
        <PageHeader title="Lathe" noMargin />
      </DashboardPinTargetContext.Provider>,
    );

    const toggle = await screen.findByRole('button', { name: 'Pin to dashboard' });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);

    expect(update).toHaveBeenCalledWith({ requestBody: { kind: 'add', item: { itemType: 'resource', itemId: '5' } } });
  });
});

describe('usePinReorder', () => {
  const stored = [page('/a'), page('/b'), page('/c')];
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const cached = () => client.getQueryData<DashboardPinDto[]>(UseDashboardServiceDashboardGetPinsKeyFn());

  it('shows the new order at once and saves it as a move', async () => {
    client.setQueryData(UseDashboardServiceDashboardGetPinsKeyFn(), stored);
    const update = updatePins().mockResolvedValue([page('/c'), page('/a'), page('/b')] as never);
    const { result } = renderHook(() => usePinReorder(stored), { wrapper });

    act(() => result.current('page:/c', 'page:/a'));

    expect(cached()).toEqual([page('/c'), page('/a'), page('/b')]);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        requestBody: { kind: 'move', item: page('/c'), before: page('/a') },
      }),
    );
  });

  it('moves a card down before the card that follows its new place', async () => {
    client.setQueryData(UseDashboardServiceDashboardGetPinsKeyFn(), stored);
    const update = updatePins().mockResolvedValue([page('/b'), page('/a'), page('/c')] as never);
    const { result } = renderHook(() => usePinReorder(stored), { wrapper });

    act(() => result.current('page:/a', 'page:/b'));

    expect(cached()).toEqual([page('/b'), page('/a'), page('/c')]);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ requestBody: { kind: 'move', item: page('/a'), before: page('/c') } }),
    );
  });

  it('moves to the end without a before item', async () => {
    const update = updatePins().mockResolvedValue([page('/b'), page('/c'), page('/a')] as never);
    const { result } = renderHook(() => usePinReorder(stored), { wrapper });

    act(() => result.current('page:/a', 'page:/c'));

    await waitFor(() => expect(update).toHaveBeenCalledWith({ requestBody: { kind: 'move', item: page('/a') } }));
  });

  it('brings back the stored order and tells the user when saving fails', async () => {
    client.setQueryData(UseDashboardServiceDashboardGetPinsKeyFn(), stored);
    getPins().mockResolvedValue(stored as never);
    updatePins().mockRejectedValue(new Error('offline') as never);
    // An active observer, as on the dashboard, so the invalidated list is fetched again.
    renderHook(() => useDashboardPins(), { wrapper });
    const { result } = renderHook(() => usePinReorder(stored), { wrapper });

    act(() => result.current('page:/c', 'page:/a'));
    expect(cached()?.[0]).toEqual(page('/c'));

    await waitFor(() =>
      expect(state.toastError).toHaveBeenCalledWith({
        title: 'The new order could not be saved. Your dashboard shows the saved order again.',
      }),
    );
    await waitFor(() => expect(cached()).toEqual(stored));
  });
});

describe('useDragAccessibility', () => {
  it('names cards by their titles, not by their internal ids', () => {
    const titles: Record<string, string> = { 'page:/projects': 'Projects', 'resource:1': 'Lathe' };
    const { result } = renderHook(() => useDragAccessibility((id) => titles[String(id)]));
    const { announcements, screenReaderInstructions } = result.current;
    const card = (id: string) => ({ id, data: { current: undefined }, rect: { current: { initial: null, translated: null } } });
    const active = card('page:/projects');
    const over = { ...card('resource:1'), disabled: false };

    expect(screenReaderInstructions?.draggable).toMatch(/^To pick up a card/);
    expect(announcements?.onDragStart({ active } as never)).toBe('Picked up Projects.');
    expect(announcements?.onDragOver({ active, over } as never)).toBe('Projects was moved over Lathe.');
    expect(announcements?.onDragEnd({ active, over } as never)).toBe('Projects was dropped in the place of Lathe.');
    expect(announcements?.onDragCancel({ active, over: null } as never)).toBe('Moving Projects was cancelled.');
  });
});
