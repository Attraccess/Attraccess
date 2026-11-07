import '@testing-library/jest-dom/vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '../test-utils';
import { IcalFeeds } from './IcalFeeds';

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('IcalFeeds', () => {
  it('lists active and revoked feeds, revoked ones without actions', async () => {
    mockFetch({ 'GET /ical/feeds': [feed(1, 'Phone'), feed(2, 'Old', '2031-02-01T00:00:00.000Z')] });
    renderWithProviders(<IcalFeeds />);
    expect(await screen.findByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('Revoked')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Regenerate' })).toHaveLength(1);
  });

  it('confirms before regenerating and shows the new URL once', async () => {
    const user = userEvent.setup();
    const calls = mockFetch({
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
    const calls = mockFetch({ 'GET /ical/feeds': [feed(1, 'Phone')], 'DELETE /ical/feeds/1': { status: 204 } });
    renderWithProviders(<IcalFeeds />);
    await user.click(await screen.findByRole('button', { name: 'Revoke' }));
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('cannot be undone');
    await user.click(screen.getAllByRole('button', { name: 'Revoke' }).at(-1) as HTMLElement);
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true));
  });
});
