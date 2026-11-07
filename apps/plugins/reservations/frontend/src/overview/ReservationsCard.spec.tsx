import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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

/** The viewer's own confirmed booking of resource 3 that runs right now. */
const running = () =>
  reservationFixture({
    resourceId: 3,
    startTime: new Date(Date.now() - 1_800_000).toISOString(),
    endTime: new Date(Date.now() + 1_800_000).toISOString(),
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
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('renders nothing, not even a spinner, while the first answer is pending', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );
    const { container } = renderWithProviders(<ReservationsCard resourceId={3} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marks the selected view for assistive technology', async () => {
    const user = userEvent.setup();
    mockFetch({ 'GET /resources/3/availability': availability() });
    renderWithProviders(<ReservationsCard resourceId={3} />);
    // A single-selection toggle group is a radio group: the chosen view is announced as checked.
    expect(await screen.findByRole('radiogroup', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Week' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Day' })).not.toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Day' }));
    expect(screen.getByRole('radio', { name: 'Day' })).toBeChecked();
  });

  it('does not poll for a keep-or-free question without a running booking of the viewer', async () => {
    const calls = mockFetch({
      'GET /resources/3/availability': availability({ reservations: [reservationFixture({ resourceId: 3 })] }),
      'GET /resources/3/pending-decision': null,
    });
    renderWithProviders(<ReservationsCard resourceId={3} />);
    await screen.findByRole('button', { name: 'Reserve' });
    await waitFor(() => expect(calls.some((call) => call.path === '/mine')).toBe(true));
    expect(calls.some((call) => call.path.endsWith('/pending-decision'))).toBe(false);
  });

  it('asks keep or free within about 5 s after the holder stopped', async () => {
    let stopped = false;
    const calls = mockFetch({
      'GET /resources/3/availability': availability({ reservations: [running()] }),
      'GET /resources/3/pending-decision': () => ({ body: stopped ? reservationFixture({ canEndEarly: true }) : null }),
    });
    renderWithProviders(<ReservationsCard resourceId={3} />);
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/pending-decision'))).toBe(true));
    stopped = true;
    expect(await screen.findByRole('alertdialog', {}, { timeout: 7_000 })).toHaveTextContent(/Keep it or free/);
  });

  it('shows an error with Retry instead of vanishing when loading fails', async () => {
    const user = userEvent.setup();
    let failing = true;
    mockFetch({
      'GET /resources/3/availability': () =>
        failing ? { status: 500, body: { message: 'boom' } } : { body: availability() },
      'GET /resources/3/pending-decision': null,
    });
    renderWithProviders(<ReservationsCard resourceId={3} />);
    expect(await screen.findByText('Reservations could not be loaded')).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Reserve' })).toBeInTheDocument();
  });

  it('keeps the card and its navigation when another range fails to load', async () => {
    const user = userEvent.setup();
    let requests = 0;
    mockFetch({
      'GET /resources/3/availability': () => (++requests === 1 ? { body: availability() } : { status: 500, body: {} }),
      'GET /resources/3/pending-decision': null,
    });
    renderWithProviders(<ReservationsCard resourceId={3} />);
    await user.click(await screen.findByRole('button', { name: 'Later' }));
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reserve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Earlier' })).toBeInTheDocument();
  });

  it('shows a running booking as the current one, whatever range is visible', async () => {
    const start = new Date(Date.now() - 1_800_000).toISOString();
    const end = new Date(Date.now() + 1_800_000).toISOString();
    mockFetch({
      'GET /resources/3/availability': availability(),
      'GET /resources/3/pending-decision': null,
      'GET /mine': [
        reservationFixture({ id: 8, resourceId: 99, startTime: start, endTime: end }),
        reservationFixture({ id: 9, resourceId: 3, startTime: start, endTime: end }),
      ],
    });
    renderWithProviders(<ReservationsCard resourceId={3} />);
    expect(await screen.findByText('Current booking')).toBeInTheDocument();
    expect(screen.queryByText('Your next booking')).not.toBeInTheDocument();
  });

  it('labels a later booking as the next one', async () => {
    mockFetch({
      'GET /resources/3/availability': availability(),
      'GET /resources/3/pending-decision': null,
      'GET /mine': [reservationFixture({ resourceId: 3 })],
    });
    renderWithProviders(<ReservationsCard resourceId={3} />);
    expect(await screen.findByText('Your next booking')).toBeInTheDocument();
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
      'GET /resources/3/availability': availability({ reservations: [running()] }),
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
      'GET /resources/3/availability': availability({ reservations: [running()] }),
      'GET /resources/3/pending-decision': reservationFixture({ canEndEarly: true }),
      'POST /7/keep': reservationFixture(),
    });
    renderWithProviders(<ReservationsCard resourceId={3} />);
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.path === '/7/keep')).toBe(true));
  });

  it('asks again when the server holds a new pending decision after an answer', async () => {
    const user = userEvent.setup();
    let answered = false;
    mockFetch({
      'GET /resources/3/availability': availability({ reservations: [running()] }),
      'GET /resources/3/pending-decision': () => ({
        body: reservationFixture({ id: answered ? 8 : 7, canEndEarly: true }),
      }),
      'POST /7/keep': () => {
        answered = true;
        return { body: reservationFixture() };
      },
    });
    renderWithProviders(<ReservationsCard resourceId={3} />);
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    await waitFor(() => expect(answered).toBe(true));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/Keep it or free the rest\?/);
  });

  it('names the resource in the booking title and resets the form after closing', async () => {
    const user = userEvent.setup();
    mockFetch({
      'GET /resources/3/availability': availability(),
      'GET /resources/3/pending-decision': null,
      'GET /api/resources/3': { id: 3, name: 'Laser' },
    });
    renderWithProviders(<ReservationsCard resourceId={3} />);
    await user.click(await screen.findByRole('button', { name: 'Reserve' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toHaveTextContent('Reserve Laser'));
    expect(dialog).toHaveTextContent('Your booking is confirmed immediately.');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    const date = () => document.querySelector<HTMLInputElement>('[data-cy="reservations-booking-date"]');
    const initial = date()?.value;
    fireEvent.change(date() as HTMLInputElement, { target: { value: '2031-01-01' } });
    expect(date()?.value).toBe('2031-01-01');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Reserve' }));
    await screen.findByRole('dialog');
    expect(date()?.value).toBe(initial);
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

  it('words the check-in window without "0 min before" when early check-in is off', async () => {
    const user = userEvent.setup();
    mockFetch({ 'GET /resources/3/availability': availability({ rules: { ...rules, earlyCheckInMinutes: 0 } }) });
    renderWithProviders(<ReservationsCard resourceId={3} />);
    await user.click(await screen.findByRole('button', { name: 'Reserve' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('from the start until 15 min after it');
    expect(dialog).not.toHaveTextContent('0 min before');
  });
});
