import '@testing-library/jest-dom/vitest';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReservationsPlugin from '../plugin';
import { mockFetch, renderWithProviders, reservationFixture } from '../test-utils';
import { UpcomingReservationsWidget } from './UpcomingReservationsWidget';

vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const timezone = { 'GET /settings/global': { timezone: 'UTC', defaultTimezone: 'UTC' } };

describe('UpcomingReservationsWidget', () => {
  it('is offered as the reservations-upcoming widget', () => {
    const [widget] = new ReservationsPlugin().getDashboardWidgets();
    expect(widget).toMatchObject({ id: 'reservations-upcoming', title: 'Upcoming reservations' });
  });

  it('links the next three bookings, marks unconfirmed ones and offers Manage to managers', async () => {
    mockFetch({
      ...timezone,
      'GET /mine': [1, 2, 3, 4].map((id) =>
        reservationFixture({ id, resourceName: `Laser ${id}`, status: id === 2 ? 'pending' : 'confirmed' }),
      ),
      'GET /manage/access': { isManager: true },
    });
    const { container } = renderWithProviders(<UpcomingReservationsWidget />);

    expect(await screen.findByRole('link', { name: /Laser 3/ })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-cy="reservations-widget-item"]')).toHaveLength(3);
    expect(screen.getByRole('link', { name: /Laser 1/ })).toHaveAttribute('href', '/reservations/1');
    expect(screen.queryByText('Laser 4')).not.toBeInTheDocument();
    expect(screen.getAllByText('Pending approval')).toHaveLength(1);
    expect(await screen.findByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/reservations/manage');
    expect(screen.getByRole('link', { name: 'My reservations' })).toHaveAttribute('href', '/reservations');
  });

  it('shows the empty state and no Manage link without manage access', async () => {
    mockFetch({ ...timezone, 'GET /mine': [], 'GET /manage/access': { isManager: false } });
    renderWithProviders(<UpcomingReservationsWidget />);

    expect(await screen.findByText('No upcoming reservations.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage' })).not.toBeInTheDocument();
  });
});
