import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import {
  DashboardPinDto,
  DashboardPinItemType,
  DashboardPinSize,
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

const page = (itemId: string): DashboardPinDto => ({ itemType: DashboardPinItemType.PAGE, itemId, size: null });
const widget = (itemId: string, size: `${DashboardPinSize}` | null = null): DashboardPinDto => ({
  itemType: DashboardPinItemType.WIDGET,
  itemId,
  size: size as DashboardPinSize | null,
});
const resource = (itemId: string, resourceName: string): DashboardPinDto => ({
  itemType: DashboardPinItemType.RESOURCE,
  itemId,
  resourceName,
  size: null,
});
const layout = {
  sizes: ['small', 'medium', 'large'] as const,
  defaultSize: 'medium' as const,
  group: { id: 'messages', title: 'Messages' },
};
const messagesWidget: DashboardWidget = {
  id: 'messages',
  title: 'Messages',
  description: 'Your latest conversations',
  icon: null,
  ...layout,
  href: '/messages',
  renderHeaderExtra: () => <span>2 unread</span>,
  renderBody: () => <p>Inbox body</p>,
};
const usersWidget: DashboardWidget = {
  id: 'users',
  title: 'Users',
  description: 'Search users',
  icon: null,
  ...layout,
  sizes: ['medium', 'large'],
  group: { id: 'users', title: 'Users' },
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
      { path: '/projects', title: 'Projects', icon: null, galleryGroup: 'other' },
      { path: '/billing', title: 'Billing', icon: null, galleryGroup: 'other' },
    ],
    titleOf: () => undefined,
    isReady: true,
  };
  state.widgets = { widgets: [messagesWidget, usersWidget], titleOf: () => undefined, isReady: true };
  state.toastError.mockReset();
  vi.spyOn(ResourcesService, 'getOneResourceById').mockResolvedValue({ id: 5, name: 'Lathe' } as never);
  vi.spyOn(ResourcesService, 'resourceUsageGetActiveSession').mockResolvedValue({ usages: [] } as never);
  // The gallery's Resource entry searches resources as soon as it opens.
  vi.spyOn(ResourcesService, 'getAllResources').mockResolvedValue({ data: [], total: 0 } as never);
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
    expect(container.querySelector('[data-cy="dashboard-card-remove-control"]')).toBeNull();
    expect(container.querySelector('[aria-roledescription="sortable"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add widget' })).toBeNull();
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
    for (const title of ['Projects', 'Lathe', 'Messages widget']) {
      expect(screen.getByRole('button', { name: `Remove ${title} from dashboard` })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Add widget' })).toBeInTheDocument();
    expect(container.querySelector('[data-cy="dashboard-edit-hint"]')).not.toBeNull();

    // The handle picks the card up from the keyboard.
    const handle = screen.getByRole('button', { name: 'Reorder Projects' });
    handle.focus();
    await userEvent.keyboard(' ');
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByRole('button', { name: 'Remove Projects from dashboard' }));
    expect(remove).toHaveBeenCalledWith({ requestBody: { kind: 'remove', item: { itemType: 'page', itemId: '/projects' } } });

    await userEvent.click(done);
    expect(await editToggle('Edit dashboard')).toHaveFocus();
    expect(container.querySelector('[data-cy="dashboard-card-drag-handle"]')).toBeNull();
    expect(container.querySelector('[data-cy="dashboard-edit-hint"]')).toBeNull();
  });

  it('moves tiles while dragging without scaling them to the shape of another size', async () => {
    const { container } = renderDashboard([page('/projects'), widget('messages')]);
    await userEvent.click(await editToggle('Edit dashboard'));

    const handle = screen.getByRole('button', { name: 'Reorder Projects' });
    handle.focus();
    await userEvent.keyboard(' ');
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.keyboard('{ArrowRight}');

    const transforms = [...container.querySelectorAll<HTMLElement>('[data-cy="dashboard-card"]')].map(
      (tile) => tile.style.transform,
    );
    expect(transforms.some((transform) => transform.startsWith('translate3d'))).toBe(true);
    expect(transforms.filter((transform) => transform.includes('scale'))).toEqual([]);
    await userEvent.keyboard('{Escape}');
  });

  it('switches modes without React errors', async () => {
    const consoleError = vi.spyOn(console, 'error');
    renderDashboard([page('/projects'), widget('messages')]);

    await userEvent.click(await editToggle('Edit dashboard'));
    await userEvent.click(await editToggle('Done'));
    await userEvent.click(await editToggle('Edit dashboard'));

    expect(consoleError).not.toHaveBeenCalled();
  });

  it('opens the gallery from the empty state, already in edit mode', async () => {
    renderDashboard([]);

    await userEvent.click(await screen.findByRole('button', { name: 'Add widget' }));

    expect(await screen.findByRole('heading', { name: 'Add widget' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'true');
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

    expect(await screen.findByText('Readers widget')).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Remove Readers widget from dashboard' })).toBeInTheDocument();
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

  it('keeps a widget inside its card when its render function itself throws, as a plugin render() may', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    state.widgets = {
      ...state.widgets,
      widgets: [
        ...state.widgets.widgets,
        {
          ...messagesWidget,
          id: 'plugin-broken',
          title: 'Plugin broken',
          renderHeaderExtra: () => {
            throw new Error('header boom');
          },
          renderBody: () => {
            throw new Error('boom');
          },
          plugin: { pluginName: 'broken-plugin', manifestName: 'broken-plugin' },
        },
      ],
    };
    renderDashboard([widget('plugin-broken'), widget('messages')]);

    expect(await screen.findAllByText('This widget stopped working. Reload the page to try again.')).toHaveLength(2);
    expect(screen.getByText('Inbox body')).toBeInTheDocument();
  });

  it('renders the body a plugin widget returns', async () => {
    state.widgets = {
      ...state.widgets,
      widgets: [
        ...state.widgets.widgets,
        {
          id: 'report-summary',
          title: 'Report summary',
          description: 'From a plugin',
          icon: null,
          ...layout,
          group: { id: 'plugin:report', title: 'Report' },
          renderBody: () => <p>Plugin body</p>,
          plugin: { pluginName: 'report', manifestName: 'report' },
        },
      ],
    };
    renderDashboard([widget('report-summary')]);

    expect(await screen.findByText('Plugin body')).toBeInTheDocument();
    expect(screen.getByText('Report summary')).toBeInTheDocument();
  });

  it('names widget controls apart from those of the page with the same title', async () => {
    state.pinnable = {
      ...state.pinnable,
      pages: [...state.pinnable.pages, { path: '/messages', title: 'Messages', icon: null, galleryGroup: 'other' }],
    };
    renderDashboard([widget('messages'), page('/messages')]);
    await userEvent.click(await editToggle('Edit dashboard'));

    expect(screen.getByRole('button', { name: 'Remove Messages widget from dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Messages from dashboard' })).toBeInTheDocument();
  });

  it('moves focus to the next card after removing one', async () => {
    state.pinnable = {
      ...state.pinnable,
      pages: [...state.pinnable.pages, { path: '/messages', title: 'Messages', icon: null, galleryGroup: 'other' }],
    };
    const update = updatePins().mockResolvedValue([widget('messages')] as never);
    renderDashboard([page('/messages'), widget('messages')]);
    await userEvent.click(await editToggle('Edit dashboard'));

    await userEvent.click(screen.getByRole('button', { name: 'Remove Messages from dashboard' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove Messages widget from dashboard' })).toHaveFocus(),
    );
  });
});

const tileOf = (container: HTMLElement, title: string) =>
  [...container.querySelectorAll<HTMLElement>('[data-cy="dashboard-card"]')].find((tile) =>
    within(tile).queryByText(title),
  ) as HTMLElement;

describe('tile sizes', () => {
  it('renders the stored size, and the default for a size the item does not offer', async () => {
    const { container } = renderDashboard([widget('messages', 'large'), widget('users', 'small'), page('/projects')]);

    await screen.findByText('Inbox body');
    expect(tileOf(container, 'Messages')).toHaveAttribute('data-size', 'large');
    expect(tileOf(container, 'Users')).toHaveAttribute('data-size', 'medium');
    expect(tileOf(container, 'Projects')).toHaveAttribute('data-size', 'small');
  });

  it('offers the size control only in edit mode and only for items with several sizes', async () => {
    const { container } = renderDashboard([widget('messages'), page('/projects')]);
    await screen.findByText('Inbox body');
    expect(screen.queryByRole('button', { name: 'Change size of Messages widget' })).toBeNull();

    await userEvent.click(await editToggle('Edit dashboard'));

    expect(screen.getByRole('button', { name: 'Change size of Messages widget' })).toBeInTheDocument();
    expect(within(tileOf(container, 'Projects')).queryByRole('button', { name: /Change size/ })).toBeNull();
  });

  it('resizes at once and saves the new size', async () => {
    const save = updatePins().mockResolvedValue([widget('messages', 'large')] as never);
    const { container } = renderDashboard([widget('messages')]);
    await userEvent.click(await editToggle('Edit dashboard'));

    await userEvent.click(screen.getByRole('button', { name: 'Change size of Messages widget' }));
    const options = await screen.findAllByRole('menuitemradio');
    expect(options.map((option) => option.textContent)).toEqual(['Small', 'Medium', 'Large']);
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Large' }));

    expect(tileOf(container, 'Messages')).toHaveAttribute('data-size', 'large');
    expect(save).toHaveBeenCalledWith({
      requestBody: { kind: 'resize', item: { itemType: 'widget', itemId: 'messages' }, size: 'large' },
    });
  });

  it('brings the stored size back and tells the user when the new size cannot be saved', async () => {
    updatePins().mockRejectedValue(new Error('offline') as never);
    const { container } = renderDashboard([widget('messages')]);
    await userEvent.click(await editToggle('Edit dashboard'));

    await userEvent.click(screen.getByRole('button', { name: 'Change size of Messages widget' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Small' }));

    await waitFor(() => expect(state.toastError).toHaveBeenCalledWith({ title: 'The new size could not be saved.' }));
    await waitFor(() => expect(tileOf(container, 'Messages')).toHaveAttribute('data-size', 'medium'));
  });
});

describe('header links', () => {
  it('link a widget header to its page outside edit mode only', async () => {
    renderDashboard([widget('messages')]);
    await screen.findByText('Inbox body');
    expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute('href', '/messages');

    await userEvent.click(await editToggle('Edit dashboard'));

    expect(screen.queryByRole('link', { name: 'Messages' })).toBeNull();
  });
});
