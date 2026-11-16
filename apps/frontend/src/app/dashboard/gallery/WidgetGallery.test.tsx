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
import { PinnablePages } from '../pinnablePagesContext';
import { DashboardWidget, DashboardWidgets } from '../widgets/widgetsContext';
import { groupGalleryEntries, matchesSearch, normalizeSearchText } from './galleryEntries';
import { WidgetGallery } from './WidgetGallery';

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
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ error: state.toastError }) }));
vi.mock('../pinnablePagesContext', () => ({ usePinnablePages: () => state.pinnable }));
vi.mock('../widgets/widgetsContext', () => ({ useDashboardWidgets: () => state.widgets }));

const widgetFixture = (
  id: string,
  title: string,
  group: { id: string; title: string },
  extra: Partial<DashboardWidget> = {},
): DashboardWidget => ({
  id,
  title,
  description: `${title} description`,
  icon: null,
  group,
  sizes: ['small', 'medium', 'large'],
  defaultSize: 'medium',
  href: `/${id}`,
  renderBody: ({ size }) => (
    <p>
      {title} body {size}
      <a href={`/${id}/inside`}>inside link</a>
    </p>
  ),
  ...extra,
});

const messages = widgetFixture('messages', 'Messages', { id: 'messages', title: 'Messages' });
const balance = widgetFixture(
  'billing-balance',
  'Balance',
  { id: 'billing', title: 'Billing' },
  { sizes: ['small', 'medium'], defaultSize: 'small', keywords: ['wallet'] },
);
const reservations = widgetFixture('reservations-upcoming', 'Upcoming reservations', {
  id: 'plugin:reservations',
  title: 'Reservations',
});

const pin = (itemType: DashboardPinItemType, itemId: string): DashboardPinDto => ({ itemType, itemId, size: null });

let client: QueryClient;

function renderGallery(pins: DashboardPinDto[] = []) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WidgetGallery isOpen onOpenChange={() => undefined} pins={pins} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const groupTitles = () => screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
// Widgets come before page shortcuts of the same title, e.g. the Messages widget and the Messages page.
const entryNamed = (title: string) =>
  screen.getAllByRole('heading', { level: 4, name: title })[0].closest('li') as HTMLElement;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  state.widgets = { widgets: [messages, balance, reservations], titleOf: () => undefined, isReady: true };
  state.pinnable = {
    pages: [
      { path: '/messages', title: 'Messages', icon: null, galleryGroup: 'messages' },
      { path: '/settings', title: 'Settings', icon: null, galleryGroup: 'other' },
      { path: '/reservations', title: 'My reservations', icon: null, galleryGroup: 'plugin:reservations' },
    ],
    titleOf: () => undefined,
    isReady: true,
  };
  state.toastError.mockReset();
  vi.spyOn(ResourcesService, 'getAllResources').mockResolvedValue({
    data: [
      { id: 5, name: 'Lathe' },
      { id: 6, name: 'Laser cutter' },
    ],
    total: 2,
  } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WidgetGallery', () => {
  it('groups widgets, page shortcuts and the Resource entry by feature, plugins last', async () => {
    renderGallery();

    expect(await screen.findByRole('heading', { name: 'Add widget' })).toBeInTheDocument();
    expect(groupTitles()).toEqual(['Messages', 'Resources', 'Billing', 'Other pages', 'Reservations']);
    const messagesGroup = screen.getByRole('region', { name: 'Messages' });
    expect(within(messagesGroup).getByRole('button', { name: 'Add Messages widget' })).toBeInTheDocument();
    expect(within(messagesGroup).getByRole('button', { name: 'Add Messages shortcut' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Resources' })).getByText('Resource')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Reservations' })).getByRole('button', {
        name: 'Add My reservations shortcut',
      }),
    ).toBeInTheDocument();
  });

  it('shows live previews at the chosen size that nothing inside can be focused or pressed in', async () => {
    renderGallery();
    const entry = await waitFor(() => entryNamed('Messages'));

    const preview = within(entry).getByText('Messages body medium').closest('[data-cy="dashboard-gallery-preview"]');
    expect(preview).toHaveAttribute('inert');
    expect(preview).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(within(entry).getByRole('radio', { name: 'Large' }));
    expect(within(entry).getByText('Messages body large')).toBeInTheDocument();

    // Links inside the previews are out of reach: tabbing through the gallery never lands in one.
    for (let step = 0; step < 40; step++) {
      await userEvent.tab();
      expect(document.activeElement?.closest('[data-cy="dashboard-gallery-preview"]')).toBeNull();
    }
    // The gallery is a modal, rendered outside the test container.
    expect(document.querySelectorAll('[data-cy="dashboard-gallery-preview"]').length).toBeGreaterThan(3);
  });

  it('finds entries by title, keyword or group, and says when nothing matches', async () => {
    renderGallery();
    const search = await screen.findByRole('searchbox', { name: 'Search widgets' });

    await userEvent.type(search, 'bal');
    expect(groupTitles()).toEqual(['Billing']);
    expect(screen.getByRole('button', { name: 'Add Balance widget' })).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'WALLET');
    expect(screen.getByRole('button', { name: 'Add Balance widget' })).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'reservations');
    expect(groupTitles()).toEqual(['Reservations']);

    await userEvent.clear(search);
    await userEvent.type(search, 'zebra');
    expect(screen.getByText('No widgets match "zebra"')).toBeInTheDocument();
  });

  it('adds an item with the chosen size, keeps the gallery open and focus on the entry', async () => {
    const add = vi
      .spyOn(DashboardService, 'dashboardUpdatePins')
      .mockResolvedValue([pin(DashboardPinItemType.WIDGET, 'billing-balance')] as never);
    const { rerender } = renderGallery();
    const entry = await waitFor(() => entryNamed('Balance'));

    await userEvent.click(within(entry).getByRole('radio', { name: 'Medium' }));
    const button = within(entry).getByRole('button', { name: 'Add Balance widget' });
    await userEvent.click(button);

    expect(add).toHaveBeenCalledWith({
      requestBody: { kind: 'add', item: { itemType: 'widget', itemId: 'billing-balance' }, size: 'medium' },
    });
    // The dashboard passes the updated pins back in.
    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <WidgetGallery
            isOpen
            onOpenChange={() => undefined}
            pins={[pin(DashboardPinItemType.WIDGET, 'billing-balance')]}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const added = within(entryNamed('Balance')).getByRole('button', { name: 'Added' });
    expect(added).toHaveAttribute('aria-disabled', 'true');
    expect(added).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Add widget' })).toBeInTheDocument();
  });

  it('marks items already on the dashboard as added', async () => {
    renderGallery([pin(DashboardPinItemType.PAGE, '/settings')]);
    const entry = await waitFor(() => entryNamed('Settings'));

    expect(within(entry).getByRole('button', { name: 'Added' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(entry).queryByRole('group', { name: 'Size' })).toBeNull();
  });

  it('pins the resource chosen in the Resource entry, with pinned resources disabled', async () => {
    const add = vi.spyOn(DashboardService, 'dashboardUpdatePins').mockResolvedValue([] as never);
    renderGallery([pin(DashboardPinItemType.RESOURCE, '5')]);
    const entry = await waitFor(() => entryNamed('Resource'));
    const addButton = within(entry).getByRole('button', { name: 'Add the chosen resource' });
    expect(addButton).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(within(entry).getByRole('combobox', { name: 'Choose resource' }));
    const lathe = await screen.findByRole('option', { name: 'Lathe' });
    expect(lathe).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('option', { name: 'Laser cutter' }));
    await userEvent.click(within(entry).getByRole('radio', { name: 'Small' }));
    await userEvent.click(addButton);

    expect(add).toHaveBeenCalledWith({
      requestBody: { kind: 'add', item: { itemType: 'resource', itemId: '6' }, size: 'small' },
    });
  });

  it('searches resources as the user types and keeps the list open while results load', async () => {
    const search = vi.spyOn(ResourcesService, 'getAllResources').mockImplementation(((params?: { search?: string }) => {
      const resources = [
        { id: 5, name: 'Lathe' },
        { id: 6, name: 'Laser cutter' },
      ].filter((resource) => resource.name.toLowerCase().includes((params?.search ?? '').toLowerCase()));
      return Promise.resolve({ data: resources, total: resources.length });
    }) as never);
    renderGallery();
    const entry = await waitFor(() => entryNamed('Resource'));

    await userEvent.type(within(entry).getByRole('combobox', { name: 'Choose resource' }), 'Las');

    await waitFor(() => expect(search).toHaveBeenCalledWith(expect.objectContaining({ search: 'Las' })));
    expect(await screen.findByRole('option', { name: 'Laser cutter' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Lathe' })).toBeNull());
  });

  it('waits for the license and plugins before calling the list complete', async () => {
    state.widgets = { ...state.widgets, isReady: false };
    renderGallery();
    expect(await screen.findByLabelText('Loading…')).toBeInTheDocument();
  });

  it('tells the user when an addition could not be saved', async () => {
    vi.spyOn(DashboardService, 'dashboardUpdatePins').mockRejectedValue(new Error('offline') as never);
    renderGallery();
    await userEvent.click(await screen.findByRole('button', { name: 'Add Settings shortcut' }));
    await waitFor(() =>
      expect(state.toastError).toHaveBeenCalledWith({ title: 'Your dashboard could not be saved. Please try again.' }),
    );
  });
});

describe('gallery entries', () => {
  const entry = (title: string, groupId: string, keywords?: string[]) => ({
    key: title,
    kind: 'widget' as const,
    title,
    groupId,
    keywords,
    sizes: ['medium' as const],
    defaultSize: 'medium' as const,
  });

  it('matches without case or diacritics', () => {
    expect(normalizeSearchText('Übersicht', 'de')).toBe('ubersicht');
    expect(matchesSearch(entry('Übersicht', 'other'), 'Weitere Seiten', 'UBER', 'de')).toBe(true);
    expect(matchesSearch(entry('Balance', 'billing', ['Guthaben']), 'Billing', 'guth', 'de')).toBe(true);
    expect(matchesSearch(entry('Balance', 'billing'), 'Billing', 'bill', 'en')).toBe(true);
    expect(matchesSearch(entry('Balance', 'billing'), 'Billing', 'zebra', 'en')).toBe(false);
  });

  it('orders built-in groups, then plugins in load order, then groups widgets name themselves', () => {
    const groups = groupGalleryEntries({
      entries: [
        entry('Custom', 'group:Lab'),
        entry('B', 'plugin:b'),
        entry('A', 'plugin:a'),
        entry('Settings', 'other'),
        entry('Inbox', 'messages'),
      ],
      builtInTitles: (id) => id.toUpperCase(),
      knownGroups: [{ id: 'group:Lab', title: 'Lab' }],
      pluginNames: ['a', 'b-c', 'b'],
    });
    expect(groups.map((group) => group.title)).toEqual(['MESSAGES', 'OTHER', 'A', 'B', 'Lab']);
  });
});
