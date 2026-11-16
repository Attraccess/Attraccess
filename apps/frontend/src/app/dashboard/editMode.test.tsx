import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import {
  DashboardPinDto,
  DashboardPinItemType,
  DashboardService,
  ResourcesService,
} from '@attraccess/react-query-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './index';
import { PinnablePages } from './pinnablePagesContext';
import { DashboardWidget, DashboardWidgets } from './widgets/widgetsContext';

const state = vi.hoisted(() => ({
  pinnable: null as unknown as PinnablePages,
  widgets: null as unknown as DashboardWidgets,
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
vi.mock('./widgets/widgetsContext', () => ({ useDashboardWidgets: () => state.widgets }));
vi.mock('../resources/usage/components/ResourceUsageSession', () => ({
  ResourceUsageSession: () => <div>Session controls</div>,
}));
vi.mock('../resourceOverview/resourceGroupCard/statusChip', () => ({ StatusChip: () => null }));

const page = (itemId: string): DashboardPinDto => ({ itemType: DashboardPinItemType.PAGE, itemId });
const widget = (itemId: string): DashboardPinDto => ({ itemType: DashboardPinItemType.WIDGET, itemId });
const resource = (itemId: string, resourceName: string): DashboardPinDto => ({
  itemType: DashboardPinItemType.RESOURCE,
  itemId,
  resourceName,
});
const messagesWidget: DashboardWidget = {
  id: 'messages',
  title: 'Messages',
  description: 'Your latest conversations',
  icon: null,
  renderHeaderExtra: () => <span>2 unread</span>,
  renderBody: () => <p>Inbox body</p>,
};
const usersWidget: DashboardWidget = {
  id: 'users',
  title: 'Users',
  description: 'Search users',
  icon: null,
  hasFields: true,
  renderBody: () => <p>Users body</p>,
};

let client: QueryClient;

function renderDashboard(pins: DashboardPinDto[]) {
  vi.spyOn(DashboardService, 'dashboardGetPins').mockResolvedValue(pins as never);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const updatePins = () => vi.spyOn(DashboardService, 'dashboardUpdatePins');
const editToggle = (name: 'Edit dashboard' | 'Done') => screen.findByRole('button', { name });

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  state.pinnable = {
    pages: [
      { path: '/projects', title: 'Projects', icon: null },
      { path: '/billing', title: 'Billing', icon: null },
    ],
    titleOf: () => undefined,
    isReady: true,
  };
  state.widgets = { widgets: [messagesWidget, usersWidget], titleOf: () => undefined, isReady: true };
  state.toastError.mockReset();
  vi.spyOn(ResourcesService, 'getOneResourceById').mockResolvedValue({ id: 5, name: 'Lathe' } as never);
  vi.spyOn(ResourcesService, 'resourceUsageGetActiveSession').mockResolvedValue({ usages: [] } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('dashboard edit mode', () => {
  it('shows a read-only view without edit controls, but keeps Remove on placeholders', async () => {
    const { container } = renderDashboard([
      page('/projects'),
      resource('5', 'Lathe'),
      widget('messages'),
      page('/gone'),
    ]);

    expect(await screen.findByText('Inbox body')).toBeInTheDocument();
    expect(screen.getByText('2 unread')).toBeInTheDocument();
    expect(container.querySelector('[data-cy="dashboard-card-drag-handle"]')).toBeNull();
    expect(container.querySelector('[data-cy="dashboard-card-unpin"]')).toBeNull();
    expect(container.querySelector('[aria-roledescription="sortable"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to dashboard' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove /gone from dashboard' })).toBeInTheDocument();
    expect(await editToggle('Edit dashboard')).toHaveAttribute('aria-pressed', 'false');
  });

  it('enters edit mode with handles, remove buttons, the Add button and the hint, and leaves it with Done', async () => {
    const remove = updatePins().mockResolvedValue([widget('messages')] as never);
    const { container } = renderDashboard([page('/projects'), resource('5', 'Lathe'), widget('messages')]);

    await userEvent.click(await editToggle('Edit dashboard'));

    const done = await editToggle('Done');
    expect(done).toHaveAttribute('aria-pressed', 'true');
    expect(done).toHaveFocus();
    expect(container.querySelectorAll('[data-cy="dashboard-card-drag-handle"]')).toHaveLength(3);
    for (const title of ['Projects', 'Lathe', 'Messages']) {
      expect(screen.getByRole('button', { name: `Remove ${title} from dashboard` })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Add to dashboard' })).toBeInTheDocument();
    expect(container.querySelector('[data-cy="dashboard-edit-hint"]')).not.toBeNull();

    // The handle picks the card up from the keyboard.
    const handle = screen.getByRole('button', { name: 'Reorder Projects' });
    handle.focus();
    await userEvent.keyboard(' ');
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByRole('button', { name: 'Remove Projects from dashboard' }));
    expect(remove).toHaveBeenCalledWith({ requestBody: { kind: 'remove', item: page('/projects') } });

    await userEvent.click(done);
    expect(await editToggle('Edit dashboard')).toHaveFocus();
    expect(container.querySelector('[data-cy="dashboard-card-drag-handle"]')).toBeNull();
    expect(container.querySelector('[data-cy="dashboard-edit-hint"]')).toBeNull();
  });

  it('opens the picker from the empty state, already in edit mode', async () => {
    renderDashboard([]);

    await userEvent.click(await screen.findByRole('button', { name: 'Add to dashboard' }));

    expect(await screen.findByRole('heading', { name: 'Add to dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Add to dashboard picker', () => {
  it('lists only what is not pinned yet and appends what the user adds', async () => {
    const add = updatePins().mockResolvedValue([page('/projects'), widget('messages'), widget('users')] as never);
    renderDashboard([page('/projects'), widget('messages')]);

    await userEvent.click(await editToggle('Edit dashboard'));
    await userEvent.click(screen.getByRole('button', { name: 'Add to dashboard' }));

    const widgets = await screen.findByRole('region', { name: 'Widgets' });
    const pages = screen.getByRole('region', { name: 'Pages' });
    expect(within(widgets).queryByText('Messages')).toBeNull();
    expect(within(widgets).getByText('Search users')).toBeInTheDocument();
    expect(within(pages).queryByText('Projects')).toBeNull();
    expect(within(pages).getByRole('button', { name: 'Add Billing to dashboard' })).toBeInTheDocument();

    await userEvent.click(within(widgets).getByRole('button', { name: 'Add Users to dashboard' }));

    expect(add).toHaveBeenCalledWith({ requestBody: { kind: 'add', item: widget('users') } });
    expect(await within(widgets).findByText('Everything is already on your dashboard.')).toBeInTheDocument();
    // The picker stays open for the next addition.
    expect(within(pages).getByRole('button', { name: 'Add Billing to dashboard' })).toBeInTheDocument();
  });

  it('tells the user when an addition could not be saved', async () => {
    updatePins().mockRejectedValue(new Error('offline') as never);
    renderDashboard([page('/projects')]);

    await userEvent.click(await editToggle('Edit dashboard'));
    await userEvent.click(screen.getByRole('button', { name: 'Add to dashboard' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add Billing to dashboard' }));

    await waitFor(() =>
      expect(state.toastError).toHaveBeenCalledWith({ title: 'Your dashboard could not be saved. Please try again.' }),
    );
  });
});

describe('widget pins', () => {
  it('renders a widget with fields on the outlined section instead of a card surface', async () => {
    renderDashboard([widget('users')]);

    const body = await screen.findByText('Users body');
    expect(body.closest('section[data-cy="dashboard-card"]')).not.toBeNull();
  });

  it('waits for the widgets before calling one inaccessible, then shows a removable placeholder', async () => {
    state.widgets = { widgets: [], titleOf: (id) => (id === 'readers' ? 'Readers' : undefined), isReady: false };
    const { rerender } = renderDashboard([widget('readers')]);

    expect(await screen.findByText('Readers')).toBeInTheDocument();
    expect(screen.queryByText('No longer accessible')).toBeNull();

    state.widgets = { ...state.widgets, isReady: true };
    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('No longer accessible')).toBeInTheDocument();
    expect(screen.getByText(/You can no longer use this widget/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Readers from dashboard' })).toBeInTheDocument();
  });

  it('keeps a crashing widget inside its card', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Broken = () => {
      throw new Error('boom');
    };
    state.widgets = {
      ...state.widgets,
      widgets: [
        ...state.widgets.widgets,
        { ...messagesWidget, id: 'broken', title: 'Broken', renderBody: () => <Broken /> },
      ],
    };
    renderDashboard([widget('broken'), widget('messages')]);

    expect(await screen.findByText('This widget stopped working. Reload the page to try again.')).toBeInTheDocument();
    expect(screen.getByText('Inbox body')).toBeInTheDocument();
  });
});
