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
  vi.useRealTimers();
});

const timezone = { 'GET /settings/global': { timezone: 'UTC', defaultTimezone: 'UTC' } };

const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const bookings = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    reservationFixture({
      id: index + 1,
      resourceName: `Laser ${index + 1}`,
      startTime: inHours(index + 2),
      endTime: inHours(index + 3),
      status: index === 1 ? 'pending' : 'confirmed',
    }),
  );

describe('UpcomingReservationsWidget', () => {
  it('is offered as the reservations-upcoming widget in three sizes, linking to /reservations', () => {
    const [widget] = new ReservationsPlugin().getDashboardWidgets();
    expect(widget).toMatchObject({
      id: 'reservations-upcoming',
      title: 'Upcoming reservations',
      href: '/reservations',
      group: 'Reservations',
      sizes: ['small', 'medium', 'large'],
      defaultSize: 'medium',
    });
  });

  it('renders at the medium size when the host calls render() without arguments', async () => {
    mockFetch({ ...timezone, 'GET /mine': bookings(8), 'GET /manage/access': { isManager: false } });
    const [widget] = new ReservationsPlugin().getDashboardWidgets();
    const { container } = renderWithProviders(<>{widget.render()}</>);

    expect(await screen.findByRole('link', { name: /Laser 3/ })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-cy="reservations-widget-item"]')).toHaveLength(3);
  });

  it('shows the next booking with a relative start on the small size, without Manage', async () => {
    mockFetch({ ...timezone, 'GET /mine': bookings(3), 'GET /manage/access': { isManager: true } });
    const { container } = renderWithProviders(<UpcomingReservationsWidget size="small" isPreview={false} />);

    expect(await screen.findByText('Laser 1')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText('in 2 hr.')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-cy="reservations-widget-item"]')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Manage' })).not.toBeInTheDocument();
  });

  it('shows a date instead of a relative start for bookings more than a day away', async () => {
    mockFetch({
      ...timezone,
      'GET /mine': [reservationFixture({ startTime: '2031-06-02T08:00:00.000Z' })],
      'GET /manage/access': { isManager: false },
    });
    renderWithProviders(<UpcomingReservationsWidget size="small" isPreview={false} />);

    expect(await screen.findByText('Laser')).toBeInTheDocument();
    const start = document.querySelector('[data-cy="reservations-widget-start"]')?.textContent ?? '';
    expect(start).toContain('2031');
    expect(start).not.toMatch(/^in /);
  });

  it.each([
    ['medium', 3],
    ['large', 7],
  ] as const)(
    'lists the next bookings on the %s size, marks unconfirmed ones and offers Manage to managers',
    async (size, count) => {
      mockFetch({ ...timezone, 'GET /mine': bookings(9), 'GET /manage/access': { isManager: true } });
      const { container } = renderWithProviders(<UpcomingReservationsWidget size={size} isPreview={false} />);

      expect(await screen.findByRole('link', { name: new RegExp(`^Laser ${count}`) })).toBeInTheDocument();
      expect(container.querySelectorAll('[data-cy="reservations-widget-item"]')).toHaveLength(count);
      expect(screen.getByRole('link', { name: /^Laser 1/ })).toHaveAttribute('href', '/reservations/1');
      expect(screen.queryByText(`Laser ${count + 1}`)).not.toBeInTheDocument();
      expect(screen.getAllByText('Pending approval')).toHaveLength(1);
      expect(await screen.findByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/reservations/manage');
      expect(screen.queryByRole('link', { name: 'My reservations' })).not.toBeInTheDocument();
    },
  );

  it('shows the empty state and no Manage link without manage access', async () => {
    mockFetch({ ...timezone, 'GET /mine': [], 'GET /manage/access': { isManager: false } });
    renderWithProviders(<UpcomingReservationsWidget />);

    expect(await screen.findByText('No upcoming reservations.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage' })).not.toBeInTheDocument();
  });
});
