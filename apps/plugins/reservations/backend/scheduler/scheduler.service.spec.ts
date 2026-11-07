import { Logger } from '@nestjs/common';
import { ReservationEntity } from '../entities/reservation.entity';
import { Harness, createHarness } from '../testing/harness.test-utils';
import { BackgroundServices, createBackgroundServices } from '../testing/background-services.test-utils';
import { renderEmail } from '../testing/email-render.test-utils';
import { OVERRUN_CHECK_WINDOW_MS, TICK_INTERVAL_MS } from './scheduler.service';

describe('ReservationScheduler', () => {
  let h: Harness;
  let p: BackgroundServices;

  type Dispatched = {
    category: string;
    recipients: number[];
    title: string;
    body: string;
    dedupeKey: string;
    email: { template: string; variables: Record<string, unknown> };
  };
  const sent = (prefix = ''): Dispatched[] =>
    h.dispatch.mock.calls
      .map(([request]) => request as Dispatched)
      .filter((r) => r.dedupeKey.startsWith(`reservations:${prefix}`));
  const row = (id: number) => h.dataSource.getRepository(ReservationEntity).findOneByOrFail({ id });
  const status = async (id: number) => (await row(id)).status;
  const manager = { userId: 99, authenticationMethod: 'session' as const };
  const holder = { userId: 10, authenticationMethod: 'session' as const };

  beforeEach(async () => {
    h = await createHarness();
    p = createBackgroundServices(h);
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

    it('does not start a second interval and unref()s the one it starts', () => {
      jest.useFakeTimers();
      jest.spyOn(p.scheduler, 'tick').mockResolvedValue();
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      p.scheduler.start();
      p.scheduler.start();
      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(1);
      const timer = setIntervalSpy.mock.results[0].value as NodeJS.Timeout;
      expect(timer.hasRef()).toBe(false);
      p.scheduler.stop();
      expect(jest.getTimerCount()).toBe(0);
      setIntervalSpy.mockRestore();
    });

    it('skips overlapping ticks', async () => {
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

  it('tells open resource pages when a booking starts and when it ends, once per tick window', async () => {
    await h.settings.update(1, { checkInEnabled: false });
    const booking = await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T13:00:00');
    h.invalidateStartBlocked.mockClear();
    h.setNow('2026-06-01T11:59:00Z');
    await p.scheduler.tick();
    expect(h.invalidateStartBlocked).not.toHaveBeenCalled();
    h.setNow('2026-06-01T12:00:00Z');
    await p.scheduler.tick();
    expect(h.invalidateStartBlocked.mock.calls).toEqual([[{ resourceId: 1 }]]);
    await p.scheduler.tick();
    expect(h.invalidateStartBlocked).toHaveBeenCalledTimes(1);
    h.setNow('2026-06-01T13:00:00Z');
    await p.scheduler.tick();
    expect(await status(booking.id)).toBe('completed');
    expect(h.invalidateStartBlocked).toHaveBeenCalledTimes(2);
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
    await p.newScheduler().tick(); // a restarted instance over the same database
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
      await p.newScheduler().tick();
      expect(await status(booking.id)).toBe('no_show');
      expect(sent('no-show')).toHaveLength(1);
      expect(renderEmail(sent('no-show')[0].email, 'en').text).toContain('no-show');
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

    it('uses the current grace period after a settings change', async () => {
      const booking = await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      await h.settings.update(1, { checkInGraceMinutes: 30 });
      h.setNow('2026-06-01T12:15:00Z');
      await p.scheduler.tick();
      expect(await status(booking.id)).toBe('confirmed');
      h.setNow('2026-06-01T12:30:00Z');
      await p.scheduler.tick();
      expect(await status(booking.id)).toBe('no_show');
    });

    it('is skipped while reservations are disabled for the resource', async () => {
      const booking = await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      await h.settings.update(1, { enabled: false });
      h.setNow('2026-06-01T12:30:00Z');
      await p.scheduler.tick();
      expect(await status(booking.id)).toBe('confirmed');
      expect(sent('no-show')).toHaveLength(0);
      h.setNow('2026-06-01T14:00:00Z');
      await p.scheduler.tick();
      expect(await status(booking.id)).toBe('completed');
    });

    it('counts a holder session that was already running before the check-in window as check-in', async () => {
      const booking = await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      h.state.sessions.push({ usageId: 41, resourceId: 1, userId: 10, startTime: new Date('2026-06-01T10:00:00Z') });
      h.setNow('2026-06-01T12:15:00Z');
      await p.scheduler.tick();
      expect(await row(booking.id)).toMatchObject({
        status: 'confirmed',
        checkedInUsageId: 41,
        checkedInAt: new Date('2026-06-01T12:15:00Z'),
      });
      expect(sent('no-show')).toHaveLength(0);
    });

    it('checks in a back-to-back booking whose holder kept the session running from the first one', async () => {
      const first = await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      const second = await p.book(10, 1, '2026-06-01T14:00:00', '2026-06-01T16:00:00');
      h.setNow('2026-06-01T11:55:00Z');
      const session = { usageId: 42, resourceId: 1, userId: 10, startTime: h.clock() };
      h.state.sessions.push(session);
      await p.events.onSessionStart(session); // the host event checks in the first booking only
      expect((await row(first.id)).checkedInUsageId).toBe(42);
      expect((await row(second.id)).checkedInAt).toBeNull();
      for (const at of ['2026-06-01T14:00:00Z', '2026-06-01T14:15:00Z']) {
        h.setNow(at);
        await p.scheduler.tick();
      }
      expect(await status(first.id)).toBe('completed');
      expect(await row(second.id)).toMatchObject({ status: 'confirmed', checkedInUsageId: 42 });
    });

    it('ignores running sessions of other users', async () => {
      const booking = await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      h.state.sessions.push({ usageId: 43, resourceId: 1, userId: 12, startTime: new Date('2026-06-01T10:00:00Z') });
      h.setNow('2026-06-01T12:15:00Z');
      await p.scheduler.tick();
      expect(await status(booking.id)).toBe('no_show');
    });

    it('releases a booking whose grace period reaches its end as no-show, not as completed', async () => {
      const booking = await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T12:15:00');
      h.setNow('2026-06-01T12:14:00Z');
      await p.scheduler.tick();
      expect(await status(booking.id)).toBe('confirmed');
      h.setNow('2026-06-01T12:15:00Z');
      await p.scheduler.tick();
      expect(await status(booking.id)).toBe('no_show');
      expect(sent('no-show')).toHaveLength(1);
    });

    it('records a no-show found long after its deadline (downtime) without mailing the holder', async () => {
      const booking = await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T13:00:00');
      h.setNow('2026-06-01T16:00:00Z');
      await p.scheduler.tick();
      await p.newScheduler().tick();
      expect(await status(booking.id)).toBe('no_show');
      expect(sent('no-show')).toHaveLength(0);
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
      await p.newScheduler().tick();
      const mails = sent('still-needed');
      expect(mails).toHaveLength(1);
      expect(mails[0].dedupeKey).toBe(`reservations:still-needed:${early.id}`);
      const mail = renderEmail(mails[0].email, 'en');
      expect(mail.hrefs).toEqual([
        `https://app.test/reservations/${early.id}?action=keep`,
        `https://app.test/reservations/${early.id}?action=cancel`,
      ]);
      expect(mail.html).not.toMatch(/token/i);
      // a booking made less than 48h ahead of its start never gets the question
      h.setNow('2026-06-02T13:00:00Z');
      const late = await p.book(11, 1, '2026-06-04T12:00:00', '2026-06-04T13:00:00');
      await p.scheduler.tick();
      expect(sent('still-needed').map((m) => m.dedupeKey)).not.toContain(`reservations:still-needed:${late.id}`);
    });

    it('is skipped when the holder already kept the booking', async () => {
      const booking = await p.book(10, 1, '2026-06-04T10:00:00', '2026-06-04T11:00:00');
      await h.reservations.keep(holder, booking.id);
      h.setNow('2026-06-02T10:00:00Z');
      await p.scheduler.tick();
      expect(sent('still-needed')).toHaveLength(0);
    });

    it('is skipped once the start is 24h away or closer (e.g. the first tick after a downtime)', async () => {
      await p.book(10, 1, '2026-06-04T10:00:00', '2026-06-04T11:00:00');
      h.setNow('2026-06-03T10:00:00Z');
      await p.scheduler.tick();
      expect(sent('still-needed')).toHaveLength(0);
      expect(sent('reminder-24h')).toHaveLength(1);
    });
  });

  it('times the 48h and 24h eligibility from the approval of a request, not from its creation', async () => {
    h.makeManager(99, 1);
    await h.settings.update(1, { approvalRequired: true });
    const lateApproved = await p.book(10, 1, '2026-06-04T10:00:00', '2026-06-04T11:00:00'); // requested 74h ahead
    const lastMinute = await p.book(11, 1, '2026-06-04T12:00:00', '2026-06-04T13:00:00');
    h.setNow('2026-06-02T12:00:00Z'); // 46h before: approval right after the 48h mark
    await h.reservations.approve(manager, lateApproved.id);
    await p.scheduler.tick();
    expect(sent('still-needed')).toHaveLength(0);
    h.setNow('2026-06-03T14:00:00Z'); // 22h before
    await h.reservations.approve(manager, lastMinute.id);
    await p.scheduler.tick();
    expect(sent('reminder-24h').map((m) => m.dedupeKey)).toEqual([`reservations:reminder-24h:${lateApproved.id}`]);
  });

  it('sends no reminders, handover or overrun notices for resources with reservations disabled', async () => {
    await p.book(10, 1, '2026-06-04T10:00:00', '2026-06-04T11:00:00'); // 48h question due 06-02 10:00
    await p.book(10, 1, '2026-06-02T10:00:00', '2026-06-02T11:00:00'); // 24h reminder due 06-01 10:00
    const running = await p.book(11, 1, '2026-06-02T12:00:00', '2026-06-02T13:00:00');
    await h.settings.update(1, { enabled: false });
    h.state.sessions.push({ usageId: 44, resourceId: 1, userId: 12, startTime: new Date('2026-06-01T08:00:00Z') });
    for (const at of ['2026-06-01T10:00:00Z', '2026-06-02T10:00:00Z', '2026-06-02T11:50:00Z', '2026-06-02T12:01:00Z']) {
      h.setNow(at);
      await p.scheduler.tick();
    }
    expect(h.dispatch).not.toHaveBeenCalled();
    expect(await status(running.id)).toBe('confirmed');
  });

  describe('24h reminder', () => {
    it('is sent once with the check-in rules, and skipped for bookings made inside the window', async () => {
      const early = await p.book(10, 1, '2026-06-02T12:00:00', '2026-06-02T13:00:00');
      h.setNow('2026-06-01T12:30:00Z');
      const fresh = await p.book(11, 1, '2026-06-02T09:00:00', '2026-06-02T10:00:00');
      await p.scheduler.tick();
      await p.scheduler.tick();
      await p.newScheduler().tick();
      const mails = sent('reminder-24h');
      expect(mails.map((m) => m.dedupeKey)).toEqual([`reservations:reminder-24h:${early.id}`]);
      expect(renderEmail(mails[0].email, 'en').text).toContain('Check-in is required');
      expect(renderEmail(mails[0].email, 'en').text).toContain('within 15 minutes after the start');
      expect(fresh.id).not.toBe(early.id);
    });

    it('states that check-in is not required when it is switched off', async () => {
      await h.settings.update(1, { checkInEnabled: false });
      await p.book(10, 1, '2026-06-02T12:00:00', '2026-06-02T13:00:00');
      h.setNow('2026-06-01T12:30:00Z');
      await p.scheduler.tick();
      expect(renderEmail(sent('reminder-24h')[0].email, 'en').text).toContain('Check-in is not required');
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
      await p.newScheduler().tick(); // another instance over the same database, like a restart
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
        { usageId: 6, resourceId: 1, userId: 99, startTime: new Date('2026-06-01T12:01:00Z') },
        { usageId: 7, resourceId: 1, userId: 10, startTime: new Date('2026-06-01T11:00:00Z') },
      );
      h.setNow('2026-06-01T12:02:00Z');
      await p.scheduler.tick();
      expect(sent('overrun')).toHaveLength(0);
    });

    it('only looks at bookings that started within the last few ticks', async () => {
      await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      h.state.sessions.push(lingering);
      const sessions = jest.spyOn(h.context.resourceAccess, 'getActiveSessions');
      h.setNow(new Date(new Date('2026-06-01T12:00:00Z').getTime() + OVERRUN_CHECK_WINDOW_MS));
      await p.scheduler.tick();
      expect(sessions).not.toHaveBeenCalled();
      expect(sent('overrun')).toHaveLength(0);
      // a delayed tick inside the window still notifies
      h.setNow(new Date(new Date('2026-06-01T12:00:00Z').getTime() + OVERRUN_CHECK_WINDOW_MS - 1));
      await p.scheduler.tick();
      expect(sessions).toHaveBeenCalledTimes(1);
      expect(sent('overrun')).toHaveLength(2);
    });
  });

  describe('reader horizon', () => {
    it('tells the readers when a booking comes within 24 h, once', async () => {
      await p.book(10, 1, '2026-06-02T12:00:00', '2026-06-02T13:00:00');
      h.invalidateReaderUi.mockClear();
      h.setNow('2026-06-01T11:00:00Z'); // 25 h before
      await p.scheduler.tick();
      expect(h.invalidateReaderUi).not.toHaveBeenCalled();
      h.setNow('2026-06-01T12:00:00Z'); // exactly 24 h before
      await p.scheduler.tick();
      expect(h.invalidateReaderUi.mock.calls).toEqual([[{ resourceId: 1 }]]);
      h.setNow('2026-06-01T12:01:00Z');
      await p.scheduler.tick();
      expect(h.invalidateReaderUi).toHaveBeenCalledTimes(1);
    });

    it('stays quiet for resources with reservations disabled', async () => {
      await p.book(10, 1, '2026-06-02T12:00:00', '2026-06-02T13:00:00');
      await h.settings.update(1, { enabled: false });
      h.invalidateReaderUi.mockClear();
      h.setNow('2026-06-01T11:59:00Z');
      await p.scheduler.tick();
      h.setNow('2026-06-01T12:00:00Z');
      await p.scheduler.tick();
      expect(h.invalidateReaderUi).not.toHaveBeenCalled();
    });
  });
});
