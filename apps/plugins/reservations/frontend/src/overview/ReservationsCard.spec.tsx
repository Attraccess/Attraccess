import '@testing-library/jest-dom/vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders, reservationFixture } from '../test-utils';
import { ReservationsCard } from './ReservationsCard';

const rules = {
  approvalRequired: false,
  timeStepMinutes: 15,
  minDurationMinutes: 15,
  maxDurationMinutes: 240,
  maxAdvanceDays: 30,
  minLeadMinutes: 0,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  maxActiveBookingsPerUser: 3,
  whoCanBook: 'can-start',
  checkInEnabled: true,
  checkInGraceMinutes: 15,
  earlyCheckInMinutes: 15,
  bookableHours: {},
};

const availability = (extra: Record<string, unknown> = {}) => ({
  resourceId: 3,
  enabled: true,
  timezone: 'Europe/Berlin',
  isManager: false,
  canBook: { allowed: true, reason: null },
  rules,
  reservations: [],
  maintenance: [],
  ...extra,
});

vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ReservationsCard', () => {
  it('renders nothing while reservations are disabled for the resource', async () => {
    const calls = mockFetch({
      'GET /resources/3/availability': availability({ enabled: false }),
      'GET /resources/3/pending-decision': null,
    });
    const { container } = renderWithProviders(<ReservationsCard resourceId={3} />);
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/availability'))).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the Reserve button when booking is allowed', async () => {
    mockFetch({ 'GET /resources/3/availability': availability(), 'GET /resources/3/pending-decision': null });
    renderWithProviders(<ReservationsCard resourceId={3} />);
    expect(await screen.findByRole('button', { name: 'Reserve' })).toBeInTheDocument();
  });

  it('shows the reason instead of the button when booking is not allowed', async () => {
    mockFetch({
      'GET /resources/3/availability': availability({ canBook: { allowed: false, reason: 'Managers only' } }),
      'GET /resources/3/pending-decision': null,
    });
    renderWithProviders(<ReservationsCard resourceId={3} />);
    expect(await screen.findByText('Managers only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reserve' })).not.toBeInTheDocument();
  });

  it('shows other bookings as Reserved and names only when the API sent them', async () => {
    const start = new Date(Date.now() + 3_600_000).toISOString();
    const end = new Date(Date.now() + 7_200_000).toISOString();
    mockFetch({
      'GET /resources/3/availability': availability({
        reservations: [reservationFixture({ id: 1, mine: false, userName: null, startTime: start, endTime: end })],
      }),
      'GET /resources/3/pending-decision': null,
    });
    renderWithProviders(<ReservationsCard resourceId={3} />);
    expect(await screen.findByText('Reserved')).toBeInTheDocument();
    expect(screen.queryByText('Ada')).not.toBeInTheDocument();
  });

  it('asks keep or free after the session ended and frees the rest on request', async () => {
    const user = userEvent.setup();
    const calls = mockFetch({
      'GET /resources/3/availability': availability(),
      'GET /resources/3/pending-decision': reservationFixture({ canEndEarly: true }),
      'POST /7/end-early': reservationFixture({ status: 'completed' }),
    });
    renderWithProviders(<ReservationsCard resourceId={3} />);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/Keep it or free the rest\?/);
    await user.click(screen.getByRole('button', { name: 'Free rest' }));
    await waitFor(() =>
      expect(calls.some((call) => call.method === 'POST' && call.path === '/7/end-early')).toBe(true),
    );
  });

  it('keeps the booking when the dialog is closed with Keep', async () => {
    const user = userEvent.setup();
    const calls = mockFetch({
      'GET /resources/3/availability': availability(),
      'GET /resources/3/pending-decision': reservationFixture({ canEndEarly: true }),
      'POST /7/keep': reservationFixture(),
    });
    renderWithProviders(<ReservationsCard resourceId={3} />);
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.path === '/7/keep')).toBe(true));
  });

  it('opens the booking form with check-in rules and the approval notice', async () => {
    const user = userEvent.setup();
    mockFetch({
      'GET /resources/3/availability': availability({ rules: { ...rules, approvalRequired: true } }),
      'GET /resources/3/pending-decision': null,
    });
    renderWithProviders(<ReservationsCard resourceId={3} />);
    await user.click(await screen.findByRole('button', { name: 'Reserve' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('A manager has to approve this booking');
    expect(dialog).toHaveTextContent('15 min before the start until 15 min after it');
    expect(screen.getByRole('button', { name: 'Request reservation' })).toBeDisabled();
  });
});
