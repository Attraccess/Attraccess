import '@testing-library/jest-dom/vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '../test-utils';
import { IcalFeeds } from './IcalFeeds';

// The shared ResourceSelector reads the host's generated client; serve it two resources by search.
const resources = [
  { id: 1, name: 'Laser' },
  { id: 2, name: 'Printer' },
];
vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceGetAllResources: ({ search }: { search: string }) => ({
    isLoading: false,
    data: { data: resources.filter((resource) => resource.name.toLowerCase().includes(search.toLowerCase())) },
  }),
}));

const selection = { resourceIds: [], groupIds: [], introduced: true, maintained: false, ownOnly: false };
const feed = (id: number, name: string, revokedAt: string | null = null) => ({
  id,
  name,
  selection,
  createdAt: '2031-01-01T00:00:00.000Z',
  revokedAt,
  lastUsedAt: null,
  tokenPrefix: 'abcd1234',
});

vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const zone = { 'GET /settings/global': { timezone: 'UTC', defaultTimezone: 'UTC' } };

describe('IcalFeeds', () => {
  it('lists active and revoked feeds, revoked ones without actions', async () => {
    mockFetch({ ...zone, 'GET /ical/feeds': [feed(1, 'Phone'), feed(2, 'Old', '2031-02-01T00:00:00.000Z')] });
    renderWithProviders(<IcalFeeds />);
    expect(await screen.findByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('Revoked')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Regenerate' })).toHaveLength(1);
  });

  it('confirms before regenerating and shows the new URL once', async () => {
    const user = userEvent.setup();
    const calls = mockFetch({
      ...zone,
      'GET /ical/feeds': [feed(1, 'Phone')],
      'POST /ical/feeds/1/regenerate': {
        feed: feed(1, 'Phone'),
        url: 'https://example.test/ical/secret-token.ics',
        token: 'secret-token',
      },
    });
    renderWithProviders(<IcalFeeds />);
    await user.click(await screen.findByRole('button', { name: 'Regenerate' }));
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    await user.click(screen.getAllByRole('button', { name: 'Regenerate' }).at(-1) as HTMLElement);
    const url = await screen.findByLabelText('Feed link');
    expect(url).toHaveValue('https://example.test/ical/secret-token.ics');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByLabelText('Feed link')).not.toBeInTheDocument());
  });

  it('revokes only after confirmation', async () => {
    const user = userEvent.setup();
    const calls = mockFetch({
      ...zone,
      'GET /ical/feeds': [feed(1, 'Phone')],
      'DELETE /ical/feeds/1': { status: 204 },
    });
    renderWithProviders(<IcalFeeds />);
    await user.click(await screen.findByRole('button', { name: 'Revoke' }));
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('cannot be undone');
    await user.click(screen.getAllByRole('button', { name: 'Revoke' }).at(-1) as HTMLElement);
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true));
  });

  it('pluralises the selection summary and shows only a short id', async () => {
    mockFetch({
      ...zone,
      'GET /ical/feeds': [
        { ...feed(1, 'One'), selection: { ...selection, introduced: false, groupIds: [1], resourceIds: [4] } },
        { ...feed(2, 'Two'), selection: { ...selection, introduced: false, groupIds: [1, 2], resourceIds: [4, 5] } },
      ],
    });
    renderWithProviders(<IcalFeeds />);
    expect(await screen.findByText('1 group, 1 resource')).toBeInTheDocument();
    expect(screen.getByText('2 groups, 2 resources')).toBeInTheDocument();
    expect(screen.getAllByText(/abcd…/)).toHaveLength(2);
    expect(screen.queryByText(/abcd1/)).not.toBeInTheDocument();
  });

  it('confirms a copied link on the button', async () => {
    const user = userEvent.setup();
    mockFetch({
      ...zone,
      'GET /ical/feeds': [feed(1, 'Phone')],
      'POST /ical/feeds/1/regenerate': { feed: feed(1, 'Phone'), url: 'https://example.test/x.ics', token: 'x' },
    });
    renderWithProviders(<IcalFeeds />);
    await user.click(await screen.findByRole('button', { name: 'Regenerate' }));
    await user.click(screen.getAllByRole('button', { name: 'Regenerate' }).at(-1) as HTMLElement);
    await user.click(await screen.findByRole('button', { name: 'Copy link' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('shows a loading indicator, then a failure with Retry', async () => {
    const user = userEvent.setup();
    let failing = true;
    mockFetch({
      ...zone,
      'GET /ical/feeds': () => (failing ? { status: 500, body: { message: 'boom' } } : { body: [feed(1, 'Phone')] }),
    });
    renderWithProviders(<IcalFeeds />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(await screen.findByText('Calendar feeds could not be loaded')).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Phone')).toBeInTheDocument();
  });

  it('shows dates in the plugin timezone', async () => {
    mockFetch({
      'GET /settings/global': { timezone: 'Pacific/Auckland', defaultTimezone: 'UTC' },
      'GET /ical/feeds': [{ ...feed(1, 'Phone'), lastUsedAt: '2031-01-01T20:00:00.000Z' }],
    });
    renderWithProviders(<IcalFeeds />);
    // 20:00 UTC is 09:00 the next day in Auckland (UTC+13 in January).
    expect(await screen.findByText(/Last used 01\/02\/2031, 09:00 AM/)).toBeInTheDocument();
  });

  it('keeps resources selected that a later search no longer lists', async () => {
    const user = userEvent.setup();
    const calls = mockFetch({
      ...zone,
      'GET /ical/feeds': [],
      'GET /api/resource-groups': [],
      'POST /ical/feeds': { feed: feed(3, 'Lab'), url: 'https://example.test/lab.ics', token: 't' },
    });
    renderWithProviders(<IcalFeeds />);
    await user.click(await screen.findByRole('button', { name: 'New feed' }));
    const form = await screen.findByRole('dialog');
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Lab');
    await user.click(within(form).getByRole('row', { name: 'Laser' }));
    await user.type(within(form).getByRole('textbox', { name: 'Search resources' }), 'Print');
    expect(within(form).queryByRole('row', { name: 'Laser' })).not.toBeInTheDocument();
    await user.click(within(form).getByRole('row', { name: 'Printer' }));
    expect(form).toHaveTextContent('2 selected');
    await user.click(within(form).getByRole('button', { name: 'Create feed' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
    const body = calls.find((call) => call.method === 'POST')?.body as { selection: { resourceIds: number[] } };
    expect([...body.selection.resourceIds].sort()).toEqual([1, 2]);
  });
});
