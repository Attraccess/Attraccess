import { Logger } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { ReservationEntity } from '../entities/reservation.entity';
import { ReservationError } from './errors';
import { Harness, at, createHarness, principal } from '../testing/harness.test-utils';

// 2026-06-01T08:00Z is "now"; Berlin is UTC+2 in June. Defaults: 15 min step, 15..240 min, 30 days.
const DAY2 = '2026-06-02';
const slot = (startHour: number, endHour: number, day = DAY2) => ({
  startTime: at(`${day}T${String(startHour).padStart(2, '0')}:00:00`),
  endTime: at(`${day}T${String(endHour).padStart(2, '0')}:00:00`),
});

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ReservationError) return error.code;
    throw error;
  }
  return 'NO_ERROR';
}

describe('ReservationService', () => {
  let h: Harness;
  const alice = principal(10);
  const bob = principal(11);
  const manager = principal(99);

  beforeEach(async () => {
    h = await createHarness();
    h.makeManager(99, 1);
  });
  afterEach(() => h.close());

  const book = (who = alice, hours: [number, number] = [8, 9], resourceId = 1, note?: string) =>
    h.reservations.create(who, { resourceId, ...slot(hours[0], hours[1]), note });

  describe('booking rules', () => {
    it('rejects when reservations are disabled', async () => {
      expect(await codeOf(book())).toBe('RESERVATIONS_DISABLED');
    });

    it('rejects unknown resources with 404', async () => {
      await h.enable(1);
      expect(await codeOf(book(alice, [8, 9], 77))).toBe('RESOURCE_NOT_FOUND');
    });

    it('answers resources hidden from the user (hidden groups) like unknown ones', async () => {
      await h.enable(1);
      h.state.hidden.add(1);
      const visible = jest.spyOn(h.visibility, 'filterVisible');
      expect(await codeOf(book())).toBe('RESOURCE_NOT_FOUND');
      expect(visible).toHaveBeenCalledWith(alice, [1]);
      expect(await h.dataSource.query('SELECT COUNT(*) AS n FROM reservations_reservation')).toEqual([{ n: 0 }]);
      h.state.hidden.delete(1);
      expect((await book()).status).toBe('confirmed');
    });

    it('creates a confirmed booking with buffer snapshot, audit and notifier', async () => {
      await h.enable(1, { bufferBeforeMinutes: 10, bufferAfterMinutes: 20 });
      const created = await book(alice, [8, 9], 1, '  my note  ');
      expect(created).toMatchObject({
        status: 'confirmed',
        userId: 10,
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 20,
        note: 'my note',
      });
      expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'reservations.created' }));
      expect(h.notifier.onConfirmed).toHaveBeenCalledWith(expect.objectContaining({ id: created.id }), {
        viaApproval: false,
      });
      expect(h.notifier.onPending).not.toHaveBeenCalled();
    });

    it.each([
      ['IN_THE_PAST', {}, { startTime: at('2026-05-30T08:00:00'), endTime: at('2026-05-30T09:00:00') }],
      [
        'OFF_TIME_STEP',
        { timeStepMinutes: 30, minDurationMinutes: 30 },
        { startTime: at('2026-06-02T08:15:00'), endTime: at('2026-06-02T09:15:00') },
      ],
      [
        'DURATION_TOO_SHORT',
        { minDurationMinutes: 60 },
        { startTime: at('2026-06-02T08:00:00'), endTime: at('2026-06-02T08:30:00') },
      ],
      [
        'DURATION_TOO_LONG',
        { maxDurationMinutes: 60 },
        { startTime: at('2026-06-02T08:00:00'), endTime: at('2026-06-02T10:00:00') },
      ],
      [
        'BEYOND_MAX_ADVANCE',
        { maxAdvanceDays: 1 },
        { startTime: at('2026-06-05T08:00:00'), endTime: at('2026-06-05T09:00:00') },
      ],
      [
        'LEAD_TIME_TOO_SHORT',
        { minLeadMinutes: 4000 },
        { startTime: at('2026-06-02T08:00:00'), endTime: at('2026-06-02T09:00:00') },
      ],
      [
        'OUTSIDE_BOOKABLE_HOURS',
        { bookableHours: { tue: [{ start: '09:00', end: '10:00' }] } },
        { startTime: at('2026-06-02T08:00:00'), endTime: at('2026-06-02T09:00:00') },
      ],
      ['INVALID_RANGE', {}, { startTime: at('2026-06-02T09:00:00'), endTime: at('2026-06-02T08:00:00') }],
    ] as const)('answers %s', async (code, patch, range) => {
      await h.enable(1, patch as never);
      expect(await codeOf(h.reservations.create(alice, { resourceId: 1, ...range }))).toBe(code);
    });

    it('accepts a booking inside the bookable hours', async () => {
      await h.enable(1, { bookableHours: { tue: [{ start: '10:00', end: '12:00' }] } });
      expect((await book(alice, [8, 9])).status).toBe('confirmed'); // 10:00-11:00 Berlin
    });

    it('caps pending + confirmed bookings per user and resource', async () => {
      await h.enable(1, { maxActiveBookingsPerUser: 2 });
      await book(alice, [8, 9]);
      await book(alice, [10, 11]);
      expect(await codeOf(book(alice, [12, 13]))).toBe('USER_BOOKING_LIMIT');
      expect((await book(bob, [12, 13])).userId).toBe(11); // the cap is per user
      await h.enable(1, { maxActiveBookingsPerUser: 0 });
      expect((await book(alice, [14, 15])).status).toBe('confirmed'); // 0 = unlimited
    });

    it('frees a cap slot when a booking is cancelled', async () => {
      await h.enable(1, { maxActiveBookingsPerUser: 1 });
      const first = await book(alice, [8, 9]);
      expect(await codeOf(book(alice, [10, 11]))).toBe('USER_BOOKING_LIMIT');
      await h.reservations.cancel(alice, first.id);
      expect((await book(alice, [10, 11])).status).toBe('confirmed');
    });
  });

  describe('conflicts', () => {
    it('rejects overlapping bookings but allows touching and other resources', async () => {
      await h.enable(1);
      await h.enable(2);
      await book(alice, [8, 10]);
      expect(await codeOf(book(bob, [9, 11]))).toBe('OVERLAP');
      expect(await codeOf(book(bob, [7, 9]))).toBe('OVERLAP');
      expect((await book(bob, [10, 11])).status).toBe('confirmed');
      expect((await book(bob, [8, 10], 2)).resourceId).toBe(2);
    });

    it('counts pending bookings but not cancelled ones', async () => {
      await h.enable(1, { approvalRequired: true });
      const pending = await book(alice, [8, 9]);
      expect(pending.status).toBe('pending');
      expect(await codeOf(book(bob, [8, 9]))).toBe('OVERLAP');
      await h.reservations.cancel(alice, pending.id);
      expect((await book(bob, [8, 9])).status).toBe('pending');
    });

    it('applies the buffers of both bookings', async () => {
      await h.enable(1, { bufferAfterMinutes: 30 });
      await book(alice, [8, 9]); // blocks until 09:30
      await h.enable(1, { bufferAfterMinutes: 0, bufferBeforeMinutes: 0 });
      // new booking without buffers still collides with the existing booking's after-buffer
      expect(
        await codeOf(
          h.reservations.create(bob, {
            resourceId: 1,
            startTime: at('2026-06-02T09:00:00'),
            endTime: at('2026-06-02T10:00:00'),
          }),
        ),
      ).toBe('OVERLAP');
      expect(
        (
          await h.reservations.create(bob, {
            resourceId: 1,
            startTime: at('2026-06-02T09:30:00'),
            endTime: at('2026-06-02T10:30:00'),
          })
        ).status,
      ).toBe('confirmed');
      // the new booking's own before-buffer collides too
      await h.enable(1, { bufferBeforeMinutes: 30 });
      expect(
        await codeOf(
          h.reservations.create(bob, {
            resourceId: 1,
            startTime: at('2026-06-02T10:45:00'),
            endTime: at('2026-06-02T11:45:00'),
          }),
        ),
      ).toBe('OVERLAP'); // blocks from 10:15, collides with 09:30-10:30
    });

    it('blocks maintenance windows, including open-ended ones', async () => {
      await h.enable(1);
      h.state.maintenance.push({
        maintenanceId: 1,
        resourceId: 1,
        startTime: at('2026-06-02T08:30:00'),
        endTime: at('2026-06-02T09:30:00'),
        reason: null,
      });
      expect(await codeOf(book(alice, [8, 9]))).toBe('MAINTENANCE');
      expect((await book(alice, [10, 11])).status).toBe('confirmed');
      h.state.maintenance.push({
        maintenanceId: 2,
        resourceId: 1,
        startTime: at('2026-06-03T00:00:00'),
        endTime: null,
        reason: null,
      });
      expect(await codeOf(h.reservations.create(alice, { resourceId: 1, ...slot(8, 9, '2026-06-10') }))).toBe(
        'MAINTENANCE',
      );
    });
  });

  describe('whoCanBook', () => {
    it('can-start: users who may start (or start supervised) may book', async () => {
      await h.enable(1, { whoCanBook: 'can-start' });
      expect(await codeOf(book(alice))).toBe('NOT_ALLOWED_TO_BOOK');
      h.state.canStart.set(10, { allowed: true, requiresSupervision: false, supervisionAllowed: false });
      expect((await book(alice)).status).toBe('confirmed');
      h.state.canStart.set(11, { allowed: false, requiresSupervision: true, supervisionAllowed: true });
      expect((await book(bob, [10, 11])).status).toBe('confirmed');
      h.state.canStart.set(12, { allowed: false, requiresSupervision: false, supervisionAllowed: true });
      expect(await codeOf(book(principal(12), [12, 13]))).toBe('NOT_ALLOWED_TO_BOOK');
    });

    it('managers-only: only managers (maintainers, introducers, resources.update)', async () => {
      await h.enable(1, { whoCanBook: 'managers-only' });
      h.state.canStart.set(10, { allowed: true, requiresSupervision: false, supervisionAllowed: false });
      expect(await codeOf(book(alice))).toBe('NOT_ALLOWED_TO_BOOK');
      expect((await book(manager)).status).toBe('confirmed');
      h.grant(50, 'resources.update');
      expect((await book(principal(50), [10, 11])).status).toBe('confirmed');
    });

    it('any-user: every signed-in user', async () => {
      await h.enable(1, { whoCanBook: 'any-user' });
      expect((await book(alice)).status).toBe('confirmed');
    });
  });

  describe('approval flow', () => {
    beforeEach(() => h.enable(1, { approvalRequired: true }));

    it('creates pending, notifies managers, and confirms on approval', async () => {
      const pending = await book();
      expect(pending.status).toBe('pending');
      expect(h.notifier.onPending).toHaveBeenCalledTimes(1);
      const approved = await h.reservations.approve(manager, pending.id, 'ok');
      expect(approved).toMatchObject({ status: 'confirmed', decidedBy: 99, decisionReason: 'ok' });
      expect(approved.decidedAt).toBeInstanceOf(Date);
      expect(h.notifier.onConfirmed).toHaveBeenCalledWith(expect.anything(), { viaApproval: true });
      expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'reservations.approved' }));
    });

    it('rejects with reason and notifies the holder', async () => {
      const pending = await book();
      const rejected = await h.reservations.reject(manager, pending.id, 'no');
      expect(rejected).toMatchObject({ status: 'rejected', decisionReason: 'no' });
      expect(h.notifier.onRejected).toHaveBeenCalled();
      expect(await codeOf(h.reservations.approve(manager, pending.id))).toBe('NOT_PENDING');
    });

    it('only managers may decide; strangers get 404 like for a missing id, the holder a 403', async () => {
      const pending = await book();
      expect(await codeOf(h.reservations.approve(bob, pending.id))).toBe('RESERVATION_NOT_FOUND');
      expect(await codeOf(h.reservations.reject(bob, pending.id))).toBe('RESERVATION_NOT_FOUND');
      expect(await codeOf(h.reservations.approve(bob, 9999))).toBe('RESERVATION_NOT_FOUND');
      expect(await codeOf(h.reservations.approve(alice, pending.id))).toBe('FORBIDDEN');
      expect((await h.store.findById(pending.id))?.status).toBe('pending');
    });

    it('cannot decide once the start passed', async () => {
      const pending = await book();
      h.setNow('2026-06-02T08:30:00Z');
      expect(await codeOf(h.reservations.approve(manager, pending.id))).toBe('ALREADY_STARTED');
    });
  });

  describe('cancel, end early, keep', () => {
    beforeEach(() => h.enable(1));

    it('holder cancels; manager cancels with a reason; strangers get 404', async () => {
      const own = await book(alice, [8, 9]);
      const cancelled = await h.reservations.cancel(alice, own.id, 'plans changed');
      expect(cancelled).toMatchObject({ status: 'cancelled', cancelledBy: 10, cancelReason: 'plans changed' });
      expect(h.notifier.onCancelled).toHaveBeenCalledWith(expect.anything(), { byUserId: 10, byHolder: true });
      expect(await codeOf(h.reservations.cancel(alice, own.id))).toBe('NOT_CANCELLABLE');

      const other = await book(alice, [10, 11]);
      expect(await codeOf(h.reservations.cancel(bob, other.id))).toBe('RESERVATION_NOT_FOUND');
      const byManager = await h.reservations.cancel(manager, other.id, 'maintenance');
      expect(byManager).toMatchObject({ status: 'cancelled', cancelledBy: 99 });
      expect(h.notifier.onCancelled).toHaveBeenLastCalledWith(expect.anything(), { byUserId: 99, byHolder: false });
    });

    it('does not cancel a running booking but ends it early (holder or manager) and frees the slot', async () => {
      const running = await book(alice, [8, 10]);
      h.setNow('2026-06-02T08:30:00Z');
      expect(await codeOf(h.reservations.cancel(alice, running.id))).toBe('ALREADY_STARTED');
      expect(await codeOf(h.reservations.endEarly(bob, running.id))).toBe('RESERVATION_NOT_FOUND');
      const ended = await h.reservations.endEarly(alice, running.id);
      expect(ended).toMatchObject({ status: 'completed' });
      expect(ended.endTime.toISOString()).toBe('2026-06-02T08:30:00.000Z');
      expect(ended.endedEarlyAt).toBeInstanceOf(Date);
      expect(await codeOf(h.reservations.endEarly(alice, running.id))).toBe('NOT_ACTIVE');
      // slot is free again right away
      expect(
        (
          await h.reservations.create(bob, {
            resourceId: 1,
            startTime: at('2026-06-02T08:30:00'),
            endTime: at('2026-06-02T09:30:00'),
          })
        ).status,
      ).toBe('confirmed');
    });

    it('lets a manager end any active booking early', async () => {
      const running = await book(alice, [8, 10]);
      h.setNow('2026-06-02T09:00:00Z');
      await h.reservations.endEarly(manager, running.id);
      expect(h.notifier.onEndedEarly).toHaveBeenCalledWith(expect.anything(), { byUserId: 99 });
    });

    it('refuses to end a booking that has not started', async () => {
      const future = await book();
      expect(await codeOf(h.reservations.endEarly(alice, future.id))).toBe('NOT_ACTIVE');
    });

    it('keep is holder-only and idempotent', async () => {
      const own = await book();
      const kept = await h.reservations.keep(alice, own.id);
      expect(kept.keptAt).toBeInstanceOf(Date);
      await expect(h.reservations.keep(alice, own.id)).resolves.toBeDefined();
      expect(await codeOf(h.reservations.keep(manager, own.id))).toBe('RESERVATION_NOT_FOUND');
      await h.reservations.cancel(alice, own.id);
      expect(await codeOf(h.reservations.keep(alice, own.id))).toBe('ALREADY_FINISHED');
    });
  });

  describe('disabling a resource', () => {
    it('requires an explicit choice when future bookings exist, then cancels them', async () => {
      await h.enable(1);
      const a = await book(alice, [8, 9]);
      await book(bob, [10, 11]);
      expect(await h.admin.futureBookingsCount(manager, 1)).toBe(2);
      expect(await codeOf(h.admin.update(manager, 1, { enabled: false }))).toBe('FUTURE_BOOKINGS_EXIST');
      const result = await h.admin.update(manager, 1, { enabled: false, cancelFutureBookings: true });
      expect(result).toMatchObject({ cancelledBookings: 2, settings: { enabled: false } });
      const row = await h.store.findById(a.id);
      expect(row).toMatchObject({ status: 'cancelled', cancelReason: 'reservations disabled', cancelledBy: 99 });
      await h.reservations.flushNotifications();
      expect(h.notifier.onRemoved).toHaveBeenCalledTimes(2);
      expect(h.settings.getCachedSettings(1).enabled).toBe(false);
    });

    it('counts with a COUNT query and cancels in one write, notifying in the background', async () => {
      await h.enable(1, { maxActiveBookingsPerUser: 0 });
      for (let hour = 8; hour < 18; hour += 1) await book(alice, [hour, hour + 1]);
      const getMany = jest.spyOn(SelectQueryBuilder.prototype, 'getMany');
      const getCount = jest.spyOn(SelectQueryBuilder.prototype, 'getCount');
      expect(await h.admin.futureBookingsCount(manager, 1)).toBe(10);
      expect(getCount).toHaveBeenCalledTimes(1);
      expect(getMany).not.toHaveBeenCalled();
      getMany.mockRestore();
      getCount.mockRestore();

      const releases: (() => void)[] = [];
      h.notifier.onRemoved.mockImplementation(() => new Promise<void>((resolve) => releases.push(resolve)));
      const result = await h.admin.update(manager, 1, { enabled: false, cancelFutureBookings: true });
      // the request returned while every mail is still in flight, and only 4 run at a time
      expect(result.cancelledBookings).toBe(10);
      expect(h.notifier.onRemoved).toHaveBeenCalledTimes(4);
      expect(await h.dataSource.getRepository(ReservationEntity).countBy({ status: 'cancelled' })).toBe(10);
      while (releases.length > 0) {
        releases.shift()?.();
        await new Promise((resolve) => setImmediate(resolve));
      }
      await h.reservations.flushNotifications();
      expect(h.notifier.onRemoved).toHaveBeenCalledTimes(10);
    });

    it('takes the booking lock while disabling, so a racing create is cancelled or refused', async () => {
      await h.enable(1);
      let release!: () => void;
      const held = h.reservations.withResourceLock(1, () => new Promise<void>((resolve) => (release = resolve)));
      const update = h.admin.update(manager, 1, { enabled: false, cancelFutureBookings: true });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(h.settings.getCachedSettings(1).enabled).toBe(true); // still waiting for the lock
      release();
      await held;
      await update;
      expect(h.settings.getCachedSettings(1).enabled).toBe(false);

      for (const createFirst of [true, false]) {
        await h.enable(1);
        const create = book(principal(20 + Number(createFirst)), createFirst ? [8, 9] : [10, 11]);
        const disable = h.admin.update(manager, 1, { enabled: false, cancelFutureBookings: true });
        const [created] = await Promise.allSettled([create, disable]);
        if (created.status === 'fulfilled') {
          expect((await h.store.findById(created.value.id))?.status).toBe('cancelled');
        } else {
          expect(created.reason).toMatchObject({ code: 'RESERVATIONS_DISABLED' });
        }
      }
      expect(await h.dataSource.getRepository(ReservationEntity).countBy({ status: 'confirmed' })).toBe(0);
    });

    it('can disable while keeping the bookings', async () => {
      await h.enable(1);
      const a = await book(alice, [8, 9]);
      const result = await h.admin.update(manager, 1, { enabled: false, cancelFutureBookings: false });
      expect(result.cancelledBookings).toBe(0);
      expect((await h.store.findById(a.id))?.status).toBe('confirmed');
    });
  });

  describe('scheduler transitions', () => {
    it('transitions exactly once', async () => {
      await h.enable(1, { approvalRequired: true });
      const pending = await book();
      expect(await h.reservations.markExpired(pending.id)).toBe(true);
      expect(await h.reservations.markExpired(pending.id)).toBe(false);
      await h.enable(1, { approvalRequired: false });
      const confirmed = await book(alice, [10, 11]);
      expect(await h.reservations.markCheckedIn(confirmed.id, 5, at('2026-06-02T10:00:00'))).toBe(true);
      expect(await h.reservations.markCheckedIn(confirmed.id, 6, at('2026-06-02T10:01:00'))).toBe(false);
      const unchecked = await book(alice, [12, 13]);
      expect(await h.reservations.markNoShow(unchecked.id)).toBe(true);
      expect(await h.reservations.markNoShow(unchecked.id)).toBe(false);
      expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'reservations.expired' }));
      expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'reservations.no_show' }));
    });

    it('never marks a checked-in booking as no-show (check-in saved after the tick loaded the row)', async () => {
      await h.enable(1);
      const booking = await book(alice, [8, 9]);
      const loadedByTick = await h.store.findById(booking.id);
      expect(loadedByTick?.checkedInAt).toBeNull();
      await h.reservations.markCheckedIn(booking.id, 5, at('2026-06-02T08:10:00'));
      expect(await h.reservations.markNoShow(booking.id)).toBe(false);
      expect(await h.store.findById(booking.id)).toMatchObject({ status: 'confirmed', checkedInUsageId: 5 });
      expect(h.audit.record).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'reservations.no_show' }));
    });

    it('claims flags and notices once', async () => {
      await h.enable(1);
      const r = await book();
      expect(await h.store.claimFlag(r.id, 'reminder24hSentAt', new Date())).toBe(true);
      expect(await h.store.claimFlag(r.id, 'reminder24hSentAt', new Date())).toBe(false);
      expect(await h.store.claimNotice(r.id, 'maintenance', '7', new Date())).toBe(true);
      expect(await h.store.claimNotice(r.id, 'maintenance', '7', new Date())).toBe(false);
      expect(await h.store.claimNotice(r.id, 'maintenance', '8', new Date())).toBe(true);
      await h.store.releaseNotice(r.id, 'maintenance', '7');
      expect(await h.store.claimNotice(r.id, 'maintenance', '7', new Date())).toBe(true);
    });

    it('finds active, upcoming and check-in candidates through the indexed queries', async () => {
      await h.enable(1);
      const r = await book(alice, [8, 10]);
      h.setNow('2026-06-02T07:50:00Z');
      expect(await h.store.findActiveForResource(1, new Date('2026-06-02T07:50:00Z'))).toHaveLength(0);
      expect((await h.store.findCheckInCandidate(10, 1, new Date('2026-06-02T07:50:00Z'), 15))?.id).toBe(r.id);
      expect(await h.store.findCheckInCandidate(10, 1, new Date('2026-06-02T07:50:00Z'), 5)).toBeNull();
      expect(await h.store.findCheckInCandidate(11, 1, new Date('2026-06-02T07:50:00Z'), 15)).toBeNull();
      expect(await h.store.findActiveForResource(1, new Date('2026-06-02T09:00:00Z'))).toHaveLength(1);
      expect(
        await h.store.findConfirmedOverlapping(1, new Date('2026-06-02T09:00:00Z'), new Date('2026-06-02T09:30:00Z')),
      ).toHaveLength(1);
      expect(
        await h.store.findUpcomingConfirmed(new Date('2026-06-02T07:00:00Z'), new Date('2026-06-02T08:00:00Z')),
      ).toHaveLength(1);
    });
  });

  describe('notifications', () => {
    beforeEach(() => h.enable(1, { approvalRequired: true }));

    it('are sent after the commit without holding up the request', async () => {
      let release!: () => void;
      const slowMail = new Promise<void>((resolve) => (release = resolve));
      const settled = jest.fn();
      h.notifier.onPending.mockReturnValue(slowMail);
      h.notifier.onConfirmed.mockReturnValue(slowMail);
      h.notifier.onCancelled.mockReturnValue(slowMail);
      const pending = await book();
      expect(h.notifier.onPending).toHaveBeenCalledTimes(1);
      expect((await h.reservations.approve(manager, pending.id)).status).toBe('confirmed');
      expect(h.notifier.onConfirmed).toHaveBeenCalledWith(expect.anything(), { viaApproval: true });
      expect((await h.reservations.cancel(alice, pending.id)).status).toBe('cancelled');
      expect(h.notifier.onCancelled).toHaveBeenCalledTimes(1);
      void h.reservations.flushNotifications().then(settled);
      await new Promise((resolve) => setImmediate(resolve));
      expect(settled).not.toHaveBeenCalled(); // all three mails still in flight
      release();
      await h.reservations.flushNotifications();
      expect(settled).toHaveBeenCalled();
    });

    it('log failures instead of rejecting (no unhandled rejection)', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      h.notifier.onPending.mockRejectedValue(new Error('smtp down'));
      h.notifier.onRejected.mockImplementation(() => {
        throw new Error('sync failure');
      });
      const pending = await book();
      await h.reservations.reject(manager, pending.id);
      await h.reservations.flushNotifications();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('smtp down'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('sync failure'));
      warn.mockRestore();
    });
  });

  describe('concurrency', () => {
    it('lets exactly one of N concurrent overlapping creates succeed', async () => {
      await h.enable(1, { maxActiveBookingsPerUser: 0 });
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) =>
          h.reservations.create(principal(100 + i), { resourceId: 1, ...slot(8, 9) }),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(failures).toHaveLength(11);
      expect(failures.every((f) => f.reason instanceof ReservationError && f.reason.code === 'OVERLAP')).toBe(true);
      expect(await h.dataSource.query('SELECT COUNT(*) AS n FROM reservations_reservation')).toEqual([{ n: 1 }]);
    });

    it('does not serialise different resources against each other', async () => {
      await h.enable(1);
      await h.enable(2);
      const results = await Promise.all([
        h.reservations.create(alice, { resourceId: 1, ...slot(8, 9) }),
        h.reservations.create(alice, { resourceId: 2, ...slot(8, 9) }),
      ]);
      expect(results.map((r) => r.resourceId)).toEqual([1, 2]);
    });
  });

  describe('start-blocked invalidation', () => {
    const invalidated = () => h.invalidateStartBlocked.mock.calls.map(([scope]) => scope);

    /** Runs one operation and returns only the invalidations it caused. */
    const invalidatedBy = async (operation: () => Promise<unknown>) => {
      h.invalidateStartBlocked.mockClear();
      await operation();
      return invalidated();
    };

    beforeEach(() => h.makeManager(99, 2));

    it('tells the host when a booking is created', async () => {
      await h.enable(2);
      expect(await invalidatedBy(() => book(alice, [8, 9], 2))).toEqual([{ resourceId: 2 }]);
    });

    it('tells the host when a pending booking is approved or rejected', async () => {
      await h.enable(2, { approvalRequired: true });
      const approved = await book(alice, [8, 9], 2);
      const rejected = await book(bob, [10, 11], 2);
      expect(await invalidatedBy(() => h.reservations.approve(manager, approved.id))).toEqual([{ resourceId: 2 }]);
      expect(await invalidatedBy(() => h.reservations.reject(manager, rejected.id))).toEqual([{ resourceId: 2 }]);
    });

    it('tells the host when a booking is cancelled', async () => {
      await h.enable(2);
      const booking = await book(alice, [8, 9], 2);
      expect(await invalidatedBy(() => h.reservations.cancel(alice, booking.id))).toEqual([{ resourceId: 2 }]);
    });

    it('tells the host when the rest of a running booking is freed', async () => {
      await h.enable(2);
      const running = await book(alice, [12, 13], 2);
      h.setNow('2026-06-02T12:30:00Z');
      expect(await invalidatedBy(() => h.reservations.endEarly(alice, running.id))).toEqual([{ resourceId: 2 }]);
    });

    it('stays quiet when the holder keeps a booking (keeping does not decide a start)', async () => {
      await h.enable(2);
      const booking = await book(alice, [8, 9], 2);
      expect(await invalidatedBy(() => h.reservations.keep(alice, booking.id))).toEqual([]);
    });

    it('tells the host when the scheduler moves a booking (no-show)', async () => {
      await h.enable(2);
      const booking = await book(alice, [8, 9], 2);
      expect(await invalidatedBy(() => h.reservations.markNoShow(booking.id))).toEqual([{ resourceId: 2 }]);
      expect(await invalidatedBy(() => h.reservations.markNoShow(booking.id))).toEqual([]);
    });

    it('tells the host once when disabling cancels the future bookings, and not when nothing was cancelled', async () => {
      await h.enable(2);
      await book(alice, [8, 9], 2);
      await book(bob, [10, 11], 2);
      expect(await invalidatedBy(() => h.reservations.cancelFutureBookings(manager, 2))).toEqual([{ resourceId: 2 }]);
      expect(await invalidatedBy(() => h.reservations.cancelFutureBookings(manager, 2))).toEqual([]);
    });

    it('tells the host when a manager changes the settings of a resource', async () => {
      await h.enable(2);
      expect(await invalidatedBy(() => h.admin.update(manager, 2, { maxDurationMinutes: 60 }))).toEqual([
        { resourceId: 2 },
      ]);
      // Saving the same values again changes nothing the start check depends on.
      expect(await invalidatedBy(() => h.admin.update(manager, 2, { maxDurationMinutes: 60 }))).toEqual([]);
    });

    it('tells the host when a manager disables the resource and cancels its future bookings', async () => {
      await h.enable(2);
      await book(alice, [8, 9], 2);
      const scopes = await invalidatedBy(() =>
        h.admin.update(manager, 2, { enabled: false, cancelFutureBookings: true }),
      );
      // Once for the cancelled bookings, once for the settings change.
      expect(scopes).toEqual([{ resourceId: 2 }, { resourceId: 2 }]);
    });

    it('never fails the change when the host cannot be told', async () => {
      await h.enable(1);
      h.invalidateStartBlocked.mockImplementation(() => {
        throw new Error('host is shutting down');
      });
      expect((await book()).status).toBe('confirmed');
    });
  });
});
