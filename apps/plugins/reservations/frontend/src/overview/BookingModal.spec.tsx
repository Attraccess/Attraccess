import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addLocalDays, localDateOf, toDateKey } from '../lib/time';
import type { Availability } from '../lib/types';
import { mockFetch, renderWithProviders } from '../test-utils';
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
};

vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const dayKey = (offset: number) => toDateKey(addLocalDays(localDateOf(new Date(), ZONE), offset));
const dateInput = () => document.querySelector<HTMLInputElement>('[data-cy="reservations-booking-date"]');

const mount = () =>
  renderWithProviders(
    <BookingModal
      resourceId={3}
      resourceName="Laser"
      availability={availability}
      isOpen
      onOpenChange={vi.fn()}
      onBooked={vi.fn()}
    />,
  );

/** Opens a HeroUI select by its trigger and picks the first offered option. */
async function pickFirst(user: ReturnType<typeof userEvent.setup>, label: string) {
  const field = document.querySelector(`[data-cy="${label}"]`) as HTMLElement;
  await waitFor(() => expect(within(field).getByRole('button')).toBeEnabled());
  await user.click(within(field).getByRole('button'));
  const options = await screen.findAllByRole('option');
  await user.click(options[0]);
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
    fireEvent.change(dateInput() as HTMLInputElement, { target: { value: dayKey(2) } });
    await pickFirst(user, 'reservations-booking-start');
    await pickFirst(user, 'reservations-booking-duration');
    await user.click(screen.getByRole('button', { name: 'Reserve' }));

    const error = await screen.findByRole('alertdialog');
    expect(error).toHaveTextContent('Reservation failed');
    expect(error).toHaveTextContent('The slot overlaps another booking. Please choose a different time.');
    expect(error).not.toHaveTextContent('Overlaps booking 12');
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.body).toMatchObject({ resourceId: 3, durationMinutes: 60 });
  });
});
