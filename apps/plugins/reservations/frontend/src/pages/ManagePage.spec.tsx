import '@testing-library/jest-dom/vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders, reservationFixture } from '../test-utils';
import { ManagePage } from './ManagePage';

vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pending = reservationFixture({ status: 'pending', mine: false, canDecide: true, canKeep: false });
const page = (items: unknown[], total = items.length) => ({ items, total, page: 1, pageSize: 25 });

describe('ManagePage', () => {
  it('sends the rejection reason with the request', async () => {
    const user = userEvent.setup();
    const calls = mockFetch({
      'GET /settings/global': { timezone: 'Europe/Berlin', defaultTimezone: 'UTC' },
      'GET /manage': page([pending]),
      'GET /api/resources': { data: [{ id: 3, name: 'Laser' }] },
      'POST /7/reject': reservationFixture({ status: 'rejected' }),
    });
    renderWithProviders(<ManagePage />);
    expect(await screen.findByText('Times in Europe/Berlin')).toBeInTheDocument();
    const [reject] = await screen.findAllByRole('button', { name: 'Reject' });
    await user.click(reject);
    const dialog = await screen.findByRole('alertdialog');
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Reason (optional)' }),
      'Machine is booked for a course',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
    expect(calls.find((call) => call.method === 'POST')).toMatchObject({
      path: '/7/reject',
      body: { reason: 'Machine is booked for a course' },
    });
  });

  it('labels the approval text as a comment', async () => {
    const user = userEvent.setup();
    mockFetch({
      'GET /settings/global': { timezone: 'Europe/Berlin', defaultTimezone: 'UTC' },
      'GET /manage': page([pending]),
      'GET /api/resources': { data: [] },
    });
    renderWithProviders(<ManagePage />);
    const [approve] = await screen.findAllByRole('button', { name: 'Approve' });
    await user.click(approve);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('textbox', { name: 'Comment (optional)' })).toBeInTheDocument();
  });

  it('pages through all bookings with HeroUI pagination', async () => {
    const user = userEvent.setup();
    const calls = mockFetch({
      'GET /settings/global': { timezone: 'Europe/Berlin', defaultTimezone: 'UTC' },
      'GET /manage': page([pending], 60),
      'GET /api/resources': { data: [] },
    });
    renderWithProviders(<ManagePage />);
    await user.click(await screen.findByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page'));
    expect(calls.some((call) => call.path === '/manage')).toBe(true);
  });

  it('searches the host for resources to filter by', async () => {
    const user = userEvent.setup();
    mockFetch({
      'GET /settings/global': { timezone: 'Europe/Berlin', defaultTimezone: 'UTC' },
      'GET /manage': page([]),
      'GET /api/resources': { data: [{ id: 51, name: 'Resource 51' }] },
    });
    renderWithProviders(<ManagePage />);
    await user.click(await screen.findByRole('button', { name: /All resources/ }));
    const urls = () => vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    await user.type(await screen.findByRole('searchbox'), '51');
    await waitFor(() =>
      expect(urls().some((url) => url.includes('/api/resources?') && url.includes('search=51'))).toBe(true),
    );
    await user.click(await screen.findByRole('option', { name: 'Resource 51' }));
    await waitFor(() =>
      expect(urls().some((url) => url.includes('/manage?') && url.includes('resourceId=51'))).toBe(true),
    );
    expect(screen.getByRole('button', { name: /Resource 51/ })).toBeInTheDocument();
  });
});
