import { Logger } from '@nestjs/common';
import { ReservationEntity } from '../entities/reservation.entity';
import { Harness, createHarness } from '../testing/harness.test-utils';
import { Part2, createPart2 } from '../testing/part2.test-utils';
import { TICK_INTERVAL_MS } from './scheduler.service';

describe('ReservationScheduler', () => {
  let h: Harness;
  let p: Part2;

  type Dispatched = {
    category: string;
    recipients: number[];
    title: string;
    body: string;
    dedupeKey: string;
    email: { text: string };
  };
  const sent = (prefix = ''): Dispatched[] =>
    h.dispatch.mock.calls
      .map(([request]) => request as Dispatched)
      .filter((r) => r.dedupeKey.startsWith(`reservations:${prefix}`));
  const status = async (id: number) =>
    (await h.dataSource.getRepository(ReservationEntity).findOneByOrFail({ id })).status;

  beforeEach(async () => {
    h = await createHarness();
    p = createPart2(h);
    await h.enable(1);
    await h.settings.warmUp();
  });
  afterEach(() => h.close());

  describe('loop', () => {
    afterEach(() => jest.useRealTimers());

    it('ticks every minute on an unref()ed interval and stops on destroy', () => {
      jest.useFakeTimers();
      const tick = jest.spyOn(p.scheduler, 'tick').mockResolvedValue();
      p.scheduler.start();
      expect(tick).toHaveBeenCalledTimes(1); // catch-up right after start
      jest.advanceTimersByTime(TICK_INTERVAL_MS * 3);
      expect(tick).toHaveBeenCalledTimes(4);
      p.scheduler.onModuleDestroy();
      jest.advanceTimersByTime(TICK_INTERVAL_MS * 3);
      expect(tick).toHaveBeenCalledTimes(4);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('does not start a second interval and skips overlapping ticks', async () => {
      const query = jest.spyOn(h.store, 'findPendingStarted');
      await Promise.all([p.scheduler.tick(), p.scheduler.tick()]);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('isolates failing steps', async () => {
      const booking = await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      jest.spyOn(h.store, 'findPendingStarted').mockRejectedValue(new Error('db down'));
      h.setNow('2026-06-01T12:20:00Z');
      await p.scheduler.tick();
      expect(await status(booking.id)).toBe('no_show');
    });
  });

  it('expires pending bookings at their start and tells the holder once', async () => {
    await h.settings.update(1, { approvalRequired: true });
    const booking = await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
    h.setNow('2026-06-01T11:59:00Z');
    await p.scheduler.tick();
    expect(await status(booking.id)).toBe('pending');
    h.setNow('2026-06-01T12:00:00Z');
    await p.scheduler.tick();
    await p.scheduler.tick();
    expect(await status(booking.id)).toBe('expired');
    expect(sent('expired')).toHaveLength(1);
    expect(sent('expired')[0].recipients).toEqual([10]);
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'reservations.expired' }));
  });

  describe('no-show', () => {
    it('releases a booking without check-in after the grace period and emails the holder once', async () => {
      const booking = await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T12:14:00Z');
      await p.scheduler.tick();
      expect(await status(booking.id)).toBe('confirmed');
      h.setNow('2026-06-01T12:15:00Z');
      await p.scheduler.tick();
      await p.scheduler.tick();
      expect(await status(booking.id)).toBe('no_show');
      expect(sent('no-show')).toHaveLength(1);
      expect(sent('no-show')[0].email.text).toContain('no-show');
      expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'reservations.no_show' }));
    });

    it('keeps checked-in bookings and bookings of resources without check-in', async () => {
      const checkedIn = await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      await h.reservations.markCheckedIn(checkedIn.id, 1, new Date('2026-06-01T12:01:00Z'));
      await h.enable(2, { checkInEnabled: false });
      await h.settings.warmUp();
      const noCheckIn = await p.book(11, 2, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T13:00:00Z');
      await p.scheduler.tick();
      expect(await status(checkedIn.id)).toBe('confirmed');
      expect(await status(noCheckIn.id)).toBe('confirmed');
    });
  });

  it('completes ended bookings', async () => {
    const booking = await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
    await h.reservations.markCheckedIn(booking.id, 1, new Date('2026-06-01T12:01:00Z'));
    h.setNow('2026-06-01T14:00:00Z');
    await p.scheduler.tick();
    expect(await status(booking.id)).toBe('completed');
  });

  describe('48h "still needed"', () => {
    it('sends Keep/Cancel deep links once, 48h before, only for bookings made at least 48h ahead', async () => {
      const early = await p.book(10, 1, '2026-06-04T10:00:00', '2026-06-04T11:00:00'); // made ~74h ahead
      h.setNow('2026-06-02T09:59:00Z');
      await p.scheduler.tick();
      expect(sent('still-needed')).toHaveLength(0);
      h.setNow('2026-06-02T10:00:00Z');
      await p.scheduler.tick();
      await p.scheduler.tick();
      const mails = sent('still-needed');
      expect(mails).toHaveLength(1);
      expect(mails[0].dedupeKey).toBe(`reservations:still-needed:${early.id}`);
      expect(mails[0].email.text).toContain(`https://app.test/reservations/${early.id}?action=keep`);
      expect(mails[0].email.text).toContain(`https://app.test/reservations/${early.id}?action=cancel`);
      expect(mails[0].email.text).not.toMatch(/token/i);
      // a booking made less than 48h ahead of its start never gets the question
      h.setNow('2026-06-02T13:00:00Z');
      const late = await p.book(11, 1, '2026-06-04T12:00:00', '2026-06-04T13:00:00');
      await p.scheduler.tick();
      expect(sent('still-needed').map((m) => m.dedupeKey)).not.toContain(`reservations:still-needed:${late.id}`);
    });
  });

  describe('24h reminder', () => {
    it('is sent once with the check-in rules, and skipped for bookings made inside the window', async () => {
      const early = await p.book(10, 1, '2026-06-02T12:00:00', '2026-06-02T13:00:00');
      h.setNow('2026-06-01T12:30:00Z');
      const fresh = await p.book(11, 1, '2026-06-02T09:00:00', '2026-06-02T10:00:00');
      await p.scheduler.tick();
      await p.scheduler.tick();
      const mails = sent('reminder-24h');
      expect(mails.map((m) => m.dedupeKey)).toEqual([`reservations:reminder-24h:${early.id}`]);
      expect(mails[0].email.text).toContain('Check-in is required');
      expect(mails[0].email.text).toContain('within 15 minutes after the start');
      expect(fresh.id).not.toBe(early.id);
    });

    it('states that check-in is not required when it is switched off', async () => {
      await h.settings.update(1, { checkInEnabled: false });
      await p.book(10, 1, '2026-06-02T12:00:00', '2026-06-02T13:00:00');
      h.setNow('2026-06-01T12:30:00Z');
      await p.scheduler.tick();
      expect(sent('reminder-24h')[0].email.text).toContain('Check-in is not required');
    });
  });

  describe('handover reminder', () => {
    it('tells other users with a running session once, handoverReminderMinutes before the start', async () => {
      await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      h.state.sessions.push(
        { usageId: 1, resourceId: 1, userId: 12, startTime: new Date('2026-06-01T09:00:00Z') },
        { usageId: 2, resourceId: 1, userId: 10, startTime: new Date('2026-06-01T09:30:00Z') },
      );
      h.setNow('2026-06-01T11:44:00Z');
      await p.scheduler.tick();
      expect(sent('handover')).toHaveLength(0);
      h.setNow('2026-06-01T11:45:00Z');
      await p.scheduler.tick();
      await p.scheduler.tick();
      p.newScheduler(); // another instance over the same database, like a restart
      await p.newScheduler().tick();
      const mails = sent('handover:');
      expect(mails).toHaveLength(1);
      expect(mails[0].recipients).toEqual([12]);
      expect(mails[0].body).toContain('is reserved from 14:00');
      expect(mails[0].body).toContain('Please finish and sign out in time');
    });

    it('stays silent while nobody else is running a session, and tells a late starter inside the window', async () => {
      await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T11:50:00Z');
      await p.scheduler.tick();
      expect(sent('handover')).toHaveLength(0);
      h.state.sessions.push({ usageId: 3, resourceId: 1, userId: 13, startTime: new Date('2026-06-01T11:51:00Z') });
      h.setNow('2026-06-01T11:52:00Z');
      await p.scheduler.tick();
      expect(sent('handover')[0].recipients).toEqual([13]);
    });
  });

  describe('overrun', () => {
    const lingering = { usageId: 5, resourceId: 1, userId: 12, startTime: new Date('2026-06-01T10:00:00Z') };

    it('notifies the holder and the lingering user once and never touches the session', async () => {
      await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      h.state.sessions.push(lingering);
      const before = JSON.stringify(h.state.sessions);
      h.setNow('2026-06-01T12:01:00Z');
      await p.scheduler.tick();
      await p.scheduler.tick();
      await p.newScheduler().tick();
      const mails = sent('overrun');
      expect(mails.map((m) => m.recipients)).toEqual([[10], [12]]);
      expect(mails[0].body).toContain('not ended automatically');
      expect(mails[1].body).toContain('not ended automatically');
      expect(JSON.stringify(h.state.sessions)).toBe(before);
      expect(await h.dataSource.getRepository(ReservationEntity).count({ where: { status: 'confirmed' } })).toBe(1);
      // the plugin context offers no way to end a session: only dispatches are possible
      expect(Object.keys(h.context.resourceAccess)).not.toEqual(expect.arrayContaining(['endSession']));
    });

    it('ignores sessions that started during the booking (manager overrides) and the holder own session', async () => {
      await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      h.state.sessions.push(
        { usageId: 6, resourceId: 1, userId: 99, startTime: new Date('2026-06-01T12:30:00Z') },
        { usageId: 7, resourceId: 1, userId: 10, startTime: new Date('2026-06-01T11:00:00Z') },
      );
      h.setNow('2026-06-01T12:31:00Z');
      await p.scheduler.tick();
      expect(sent('overrun')).toHaveLength(0);
    });
  });
});
