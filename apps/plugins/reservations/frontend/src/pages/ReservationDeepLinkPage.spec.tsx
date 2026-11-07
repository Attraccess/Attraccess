import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, reservationFixture } from '../test-utils';
import { ReservationDeepLinkPage } from './ReservationDeepLinkPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (url: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/reservations/:id" element={<ReservationDeepLinkPage />} />
          <Route path="/reservations" element={<p>my page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('ReservationDeepLinkPage', () => {
  it('only reads on open and asks for confirmation before cancelling', async () => {
    const user = userEvent.setup();
    const calls = mockFetch({
      'GET /7': reservationFixture(),
      'GET /settings/global': { timezone: 'Europe/Berlin', defaultTimezone: 'UTC' },
      'POST /7/cancel': reservationFixture({ status: 'cancelled' }),
    });
    mount('/reservations/7?action=cancel');
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Cancel this booking?');
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.path === '/7/cancel')).toBe(true));
    expect(await screen.findByText('my page')).toBeInTheDocument();
  });

  it('asks before keeping and does nothing when the dialog is dismissed', async () => {
    const user = userEvent.setup();
    const calls = mockFetch({
      'GET /7': reservationFixture(),
      'GET /settings/global': { timezone: 'Europe/Berlin', defaultTimezone: 'UTC' },
    });
    mount('/reservations/7?action=keep');
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Keep this booking?');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  });

  it('shows no dialog without an action parameter', async () => {
    mockFetch({ 'GET /7': reservationFixture(), 'GET /settings/global': { timezone: 'UTC', defaultTimezone: 'UTC' } });
    mount('/reservations/7');
    expect(await screen.findByText('Laser')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
