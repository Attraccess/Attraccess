import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPinDto, DashboardPinItemType } from '@attraccess/react-query-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PinnablePages } from '../pinnablePagesContext';
import { DashboardWidget, DashboardWidgets } from '../widgets/widgetsContext';
import { groupGalleryEntries, matchesSearch, normalizeSearchText } from './galleryEntries';
import { WidgetGallery } from './WidgetGallery';
import * as sdk from '@attraccess/react-query-client/sdk';
import { sdkResult } from '../../../test-utils/sdk-mock';

vi.mock('@attraccess/react-query-client/sdk', async (importOriginal) =>
  (await import('../../../test-utils/sdk-mock')).spyOnSdk(await importOriginal<object>()),
);

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
  vi.mocked(sdk.getAllResources).mockResolvedValue(
    sdkResult({
      data: [
        { id: 5, name: 'Lathe' },
        { id: 6, name: 'Laser cutter' },
      ],
      total: 2,
    }),
  );
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

  it('opens unfiltered again after closing with a search term', async () => {
    function Reopenable() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <>
          <button onClick={() => setIsOpen(true)}>Reopen</button>
          <WidgetGallery isOpen={isOpen} onOpenChange={setIsOpen} pins={[]} />
        </>
      );
    }
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Reopenable />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Search widgets' }), 'zebra');
    await userEvent.click(document.querySelector('[data-cy="dashboard-picker-close"]') as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('searchbox')).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(await screen.findByRole('searchbox', { name: 'Search widgets' })).toHaveValue('');
    expect(groupTitles()).toContain('Messages');
  });

  it('names each group region after its title, even a title with spaces', async () => {
    const tools = widgetFixture('tools', 'Tools', { id: 'group:My shop tools', title: 'My shop tools' });
    state.widgets = { ...state.widgets, widgets: [...state.widgets.widgets, tools] };
    renderGallery();

    const region = await screen.findByRole('region', { name: 'My shop tools' });
    expect(within(region).getByRole('button', { name: 'Add Tools widget' })).toBeInTheDocument();
  });

  it('adds an item with the chosen size, keeps the gallery open and focus on the entry', async () => {
    const add = vi
      .mocked(sdk.dashboardUpdatePins)
      .mockResolvedValue(sdkResult([pin(DashboardPinItemType.WIDGET, 'billing-balance')]));
    const { rerender } = renderGallery();
    const entry = await waitFor(() => entryNamed('Balance'));

    await userEvent.click(within(entry).getByRole('radio', { name: 'Medium' }));
    const button = within(entry).getByRole('button', { name: 'Add Balance widget' });
    await userEvent.click(button);

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { kind: 'add', item: { itemType: 'widget', itemId: 'billing-balance' }, size: 'medium' },
      }),
    );
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
    const added = within(entryNamed('Balance')).getByRole('button', { name: 'Balance widget added' });
    expect(added).toHaveAttribute('aria-disabled', 'true');
    expect(added).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Add widget' })).toBeInTheDocument();
  });

  it('marks items already on the dashboard as added', async () => {
    renderGallery([pin(DashboardPinItemType.PAGE, '/settings')]);
    const entry = await waitFor(() => entryNamed('Settings'));

    const added = within(entry).getByRole('button', { name: 'Settings shortcut added' });
    expect(added).toHaveAttribute('aria-disabled', 'true');
    expect(added).toHaveTextContent('Added');
    expect(within(entry).queryByRole('group', { name: 'Size' })).toBeNull();
  });

  it('pins the resource chosen in the Resource entry, with pinned resources disabled', async () => {
    const add = vi.mocked(sdk.dashboardUpdatePins).mockResolvedValue(sdkResult([]));
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

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ body: { kind: 'add', item: { itemType: 'resource', itemId: '6' }, size: 'small' } }),
    );
  });

  it('searches resources as the user types and keeps the list open while results load', async () => {
    const search = vi.mocked(sdk.getAllResources).mockImplementation(((options?: { query?: { search?: string } }) => {
      const resources = [
        { id: 5, name: 'Lathe' },
        { id: 6, name: 'Laser cutter' },
      ].filter((resource) => resource.name.toLowerCase().includes((options?.query?.search ?? '').toLowerCase()));
      return Promise.resolve(sdkResult({ data: resources, total: resources.length }));
    }) as never);
    renderGallery();
    const entry = await waitFor(() => entryNamed('Resource'));

    await userEvent.type(within(entry).getByRole('combobox', { name: 'Choose resource' }), 'Las');

    await waitFor(() =>
      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.objectContaining({ search: 'Las' }) }),
      ),
    );
    expect(await screen.findByRole('option', { name: 'Laser cutter' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Lathe' })).toBeNull());
  });

  it('waits for the license and plugins before calling the list complete', async () => {
    state.widgets = { ...state.widgets, isReady: false };
    renderGallery();
    expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
  });

  it('tells the user when an addition could not be saved', async () => {
    vi.mocked(sdk.dashboardUpdatePins).mockRejectedValue(new Error('offline') as never);
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
