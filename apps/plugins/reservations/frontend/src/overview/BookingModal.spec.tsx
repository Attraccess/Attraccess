import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addLocalDays, localDateOf, toDateKey, wallClockToDate } from '../lib/time';
import type { Availability, Reservation } from '../lib/types';
import { mockFetch, renderWithProviders, reservationFixture } from '../test-utils';
import { BookingModal } from './BookingModal';

const ZONE = 'Europe/Berlin';
const availability: Availability = {
  resourceId: 3,
  enabled: true,
  timezone: ZONE,
  isManager: false,
  canBook: { allowed: true, reason: null },
  rules: {
    approvalRequired: false,
    timeStepMinutes: 60,
    minDurationMinutes: 60,
    maxDurationMinutes: 120,
    maxAdvanceDays: 10,
    minLeadMinutes: 0,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    maxActiveBookingsPerUser: 3,
    whoCanBook: 'can-start',
    checkInEnabled: true,
    checkInGraceMinutes: 15,
    earlyCheckInMinutes: 15,
    bookableHours: {},
  },
  reservations: [],
  maintenance: [],
  slots: 1,
};

vi.setConfig({ testTimeout: 30_000 });

// A Tuesday, 10:00 in Europe/Berlin: "today" cannot change between the test and the component.
// Only Date is faked; it keeps running from there.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2030-01-15T09:00:00.000Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const dayKey = (offset: number) => toDateKey(addLocalDays(localDateOf(new Date(), ZONE), offset));
const dateInput = () => document.querySelector<HTMLInputElement>('[data-cy="reservations-booking-date"]');

const mount = (shown: Availability = availability) =>
  renderWithProviders(
    <BookingModal
      resourceId={3}
      resourceName="Laser"
      availability={shown}
      isOpen
      onOpenChange={vi.fn()}
      onBooked={vi.fn()}
    />,
  );

/** Opens a HeroUI select by its trigger and returns the offered options. */
async function openOptions(user: ReturnType<typeof userEvent.setup>, label: string) {
  const field = document.querySelector(`[data-cy="${label}"]`) as HTMLElement;
  await waitFor(() => expect(within(field).getByRole('button')).toBeEnabled());
  await user.click(within(field).getByRole('button'));
  return screen.findAllByRole('option');
}

/** Opens a HeroUI select by its trigger and picks the first offered option. */
async function pickFirst(user: ReturnType<typeof userEvent.setup>, label: string) {
  const options = await openOptions(user, label);
  await user.click(options[0]);
}

/** Two days ahead, 10:00 to 11:00 local time: booked by someone else. */
const otherBooking = () => {
  const day = addLocalDays(localDateOf(new Date(), ZONE), 2);
  return reservationFixture({
    id: 21,
    mine: false,
    userName: null,
    startTime: wallClockToDate({ ...day, hour: 10, minute: 0 }, ZONE).toISOString(),
    endTime: wallClockToDate({ ...day, hour: 11, minute: 0 }, ZONE).toISOString(),
  }) as Reservation;
};

/** Picks a start and a duration two days ahead, submits, and returns the error dialog. */
async function submitAndFail(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(dateInput() as HTMLInputElement, { target: { value: dayKey(2) } });
  await pickFirst(user, 'reservations-booking-start');
  await pickFirst(user, 'reservations-booking-duration');
  await user.click(screen.getByRole('button', { name: 'Reserve' }));
  return screen.findByRole('alertdialog');
}

describe('BookingModal', () => {
  it('limits the date picker to today up to the advance limit, in the plugin timezone', async () => {
    mockFetch({ 'GET /resources/3/availability': availability });
    mount();
    await screen.findByRole('dialog');
    expect(dateInput()).toHaveAttribute('min', dayKey(0));
    expect(dateInput()).toHaveAttribute('max', dayKey(10));
  });

  it('shows the localised overlap message when the server answers 409 OVERLAP', async () => {
    const user = userEvent.setup();
    const calls = mockFetch({
      'GET /resources/3/availability': availability,
      'POST /': () => ({ status: 409, body: { code: 'OVERLAP', message: 'Overlaps booking 12' } }),
    });
    mount();
    await screen.findByRole('dialog');

    const error = await submitAndFail(user);
    expect(error).toHaveTextContent('Reservation failed');
    expect(error).toHaveTextContent('The slot overlaps another booking. Please choose a different time.');
    expect(error).not.toHaveTextContent('Overlaps booking 12');
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.body).toMatchObject({ resourceId: 3, durationMinutes: 60 });
  });

  describe('on a shared machine', () => {
    const shared = (slots: number): Availability => ({ ...availability, slots, reservations: [otherBooking()] });

    // 24 hourly starts on a free day; only an exclusive resource drops the 10:00 start of the other booking.
    it.each([
      [2, 24],
      [1, 23],
    ])('with %i slot(s) offers %i starts around another booking', async (slots, count) => {
      const user = userEvent.setup();
      mockFetch({ 'GET /resources/3/availability': shared(slots) });
      mount(shared(slots));
      await screen.findByRole('dialog');
      fireEvent.change(dateInput() as HTMLInputElement, { target: { value: dayKey(2) } });
      expect(await openOptions(user, 'reservations-booking-start')).toHaveLength(count);
    });

    it('says all slots are booked when the server answers 409 OVERLAP', async () => {
      const user = userEvent.setup();
      mockFetch({
        'GET /resources/3/availability': shared(2),
        'POST /': () => ({ status: 409, body: { code: 'OVERLAP', message: 'All slots are booked at that time' } }),
      });
      mount(shared(2));
      await screen.findByRole('dialog');
      const error = await submitAndFail(user);
      expect(error).toHaveTextContent('All slots are booked at this time. Please choose a different time.');
      expect(error).not.toHaveTextContent('overlaps another booking');
    });

    it('shows the own-overlap message when the server answers 409 OWN_OVERLAP', async () => {
      const user = userEvent.setup();
      mockFetch({
        'GET /resources/3/availability': shared(2),
        'POST /': () => ({ status: 409, body: { code: 'OWN_OVERLAP', message: 'You already have a booking' } }),
      });
      mount(shared(2));
      await screen.findByRole('dialog');
      const error = await submitAndFail(user);
      expect(error).toHaveTextContent(
        'You already have a booking that overlaps this time. Please choose a different time.',
      );
    });
  });
});
