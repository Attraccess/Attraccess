import '@testing-library/jest-dom/vitest';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { wallClockToDate } from '../lib/time';
import type { Availability, Reservation } from '../lib/types';
import { renderWithProviders, reservationFixture } from '../test-utils';
import { AvailabilityTimeline } from './AvailabilityTimeline';

const ZONE = 'Europe/Berlin';
const DAY = { year: 2030, month: 6, day: 4 };
const at = (hour: number) => wallClockToDate({ ...DAY, hour, minute: 0 }, ZONE).toISOString();

const booking = (id: number, startHour: number, endHour: number, extra: Record<string, unknown> = {}) =>
  reservationFixture({
    id,
    mine: false,
    userName: null,
    startTime: at(startHour),
    endTime: at(endHour),
    ...extra,
  }) as Reservation;

const availability = (slots: number, reservations: Reservation[]): Availability => ({
  resourceId: 3,
  enabled: true,
  timezone: ZONE,
  isManager: false,
  canBook: { allowed: true, reason: null },
  rules: {
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
  },
  reservations,
  maintenance: [],
  slots,
});

const render = (slots: number, reservations: Reservation[]) =>
  renderWithProviders(<AvailabilityTimeline availability={availability(slots, reservations)} days={[DAY]} />);

const chips = () => Array.from(document.querySelectorAll<HTMLElement>('[data-cy="reservations-timeline-slots"]'));

afterEach(cleanup);

describe('AvailabilityTimeline', () => {
  it('shows how many slots of a shared machine are reserved', () => {
    render(3, [booking(1, 10, 12), booking(2, 10, 12)]);
    expect(chips().map((chip) => chip.textContent)).toEqual(['2 of 3 slots reserved', '2 of 3 slots reserved']);
    expect(chips()[0]).not.toHaveClass('chip--danger');
    expect(chips()[0]).toHaveClass('rv:whitespace-nowrap');
  });

  it('marks a full period in the danger colour', () => {
    render(2, [booking(1, 10, 12), booking(2, 10, 12)]);
    expect(chips().map((chip) => chip.textContent)).toEqual(['2 of 2 slots reserved', '2 of 2 slots reserved']);
    expect(chips()[0]).toHaveClass('chip--danger');
  });

  it('counts the peak over the whole period, not only at its start', () => {
    render(2, [booking(1, 10, 12), booking(2, 11, 12)]);
    expect(chips().map((chip) => chip.textContent)).toEqual(['2 of 2 slots reserved', '2 of 2 slots reserved']);
  });

  it('counts the buffers like the booking picker', () => {
    render(2, [booking(1, 10, 11, { bufferAfterMinutes: 30 }), booking(2, 11, 12), booking(3, 13, 14)]);
    expect(chips().map((chip) => chip.textContent)).toEqual([
      '2 of 2 slots reserved',
      '2 of 2 slots reserved',
      '1 of 2 slots reserved',
    ]);
  });

  it('shows no count on an exclusive resource', () => {
    render(1, [booking(1, 10, 12)]);
    expect(screen.getByText('Reserved')).toBeInTheDocument();
    expect(chips()).toHaveLength(0);
  });
});
