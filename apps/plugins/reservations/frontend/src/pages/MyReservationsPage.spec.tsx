import '@testing-library/jest-dom/vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders, reservationFixture } from '../test-utils';
import { MyReservationsPage } from './MyReservationsPage';

vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MyReservationsPage', () => {
  it('names the timezone, links to the manage page from GET /manage/access and loads no manage list', async () => {
    const calls = mockFetch({
      'GET /settings/global': { timezone: 'Europe/Berlin', defaultTimezone: 'UTC' },
      'GET /mine': [reservationFixture()],
      'GET /manage/access': { isManager: true },
      'GET /ical/feeds': [],
    });
    renderWithProviders(<MyReservationsPage />);
    expect(await screen.findByText('Times in Europe/Berlin')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Manage reservations' })).toHaveAttribute(
      'href',
      '/reservations/manage',
    );
    expect(screen.getAllByRole('link', { name: 'Laser' })[0]).toHaveAttribute('href', '/reservations/7');
    expect(calls.some((call) => call.path === '/manage')).toBe(false);
  });

  it('waits for the plugin timezone before showing times', async () => {
    let answer: () => void = () => undefined;
    const settled = new Promise<void>((resolve) => {
      answer = resolve;
    });
    mockFetch({
      'GET /mine': [reservationFixture()],
      'GET /manage/access': { isManager: false },
      'GET /ical/feeds': [],
    });
    const mocked = vi.mocked(fetch);
    const original = mocked.getMockImplementation();
    mocked.mockImplementation(async (input, init) => {
      if (String(input).includes('/settings/global')) {
        await settled;
        return { ok: true, status: 200, text: async () => '{"timezone":"UTC","defaultTimezone":"UTC"}' } as Response;
      }
      return (original as typeof fetch)(input, init);
    });
    renderWithProviders(<MyReservationsPage />);
    await waitFor(() => expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0));
    expect(screen.queryByRole('link', { name: 'Laser' })).not.toBeInTheDocument();
    answer();
    expect(await screen.findByText('Times in UTC')).toBeInTheDocument();
    expect((await screen.findAllByRole('link', { name: 'Laser' })).length).toBeGreaterThan(0);
  });
});
