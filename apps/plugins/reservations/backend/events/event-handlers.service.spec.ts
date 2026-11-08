import { type ResourceHealthChangedPayload, SystemEvent } from '@attraccess/plugins-backend-sdk';
import { PendingDecisionService } from '../hooks/pending-decision.service';
import { ReservationEntity } from '../entities/reservation.entity';
import { ReservationQueryService } from '../reservations/reservation-query.service';
import { Harness, createHarness } from '../testing/harness.test-utils';
import { BackgroundServices, createBackgroundServices } from '../testing/background-services.test-utils';

describe('ReservationEventHandlers', () => {
  let h: Harness;
  let p: BackgroundServices;

  type Dispatched = { category: string; recipients: number[]; body: string; dedupeKey: string };
  const sent = (prefix: string): Dispatched[] =>
    h.dispatch.mock.calls
      .map(([request]) => request as Dispatched)
      .filter((request) => request.dedupeKey.startsWith(`reservations:${prefix}`));
  const row = (id: number) => h.dataSource.getRepository(ReservationEntity).findOneByOrFail({ id });
  const started = (userId: number, usageId = 100, supervisorUserId: number | null = null) => ({
    resourceId: 1,
    usageId,
    userId,
    startTime: h.clock(),
    supervisorUserId,
  });

  beforeEach(async () => {
    h = await createHarness();
    p = createBackgroundServices(h);
    await h.enable(1);
    await h.settings.warmUp();
    h.makeManager(99, 1);
    h.makeManager(98, 1);
    p.info.managers.set(1, [98, 99]);
    p.events.onModuleInit();
  });
  afterEach(async () => {
    p.events.onModuleDestroy();
    await h.close();
  });

  describe('subscription', () => {
    it('detaches on destroy', async () => {
      const booking = await p.book(10, 1, '2026-06-01T08:15:00', '2026-06-01T10:00:00');
      p.events.onModuleDestroy();
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, started(10));
      expect((await row(booking.id)).checkedInAt).toBeNull();
    });
  });

  describe('check-in', () => {
    it('checks the holder in when starting inside [start - early, end)', async () => {
      const booking = await p.book(10, 1, '2026-06-01T08:30:00', '2026-06-01T10:00:00');
      h.setNow('2026-06-01T08:15:00Z');
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, started(10, 55));
      expect(await row(booking.id)).toMatchObject({ checkedInAt: expect.any(Date), checkedInUsageId: 55 });
    });

    it('a start on a reader by the holder inside the early check-in window checks in and refreshes the slots', async () => {
      const booking = await p.book(10, 1, '2026-06-01T08:30:00', '2026-06-01T10:00:00');
      h.setNow('2026-06-01T08:20:00Z');
      // The reader start passes the pre-start hook without a question for the holder...
      expect(
        await p.preStart.evaluate({
          resourceId: 1,
          userId: 10,
          principal: 10,
          action: 'start',
          origin: 'reader',
          confirmedStepKeys: [],
          language: 'en',
          now: h.clock(),
        }),
      ).toEqual({ decision: 'allow' });
      h.invalidateReaderUi.mockClear();
      // ...and the host's session event (a reader start emits the same event) records the check-in.
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, started(10, 56));
      expect(await row(booking.id)).toMatchObject({ checkedInAt: expect.any(Date), checkedInUsageId: 56 });
      expect(h.invalidateReaderUi).toHaveBeenCalledWith({ resourceId: 1 });
    });

    it('does not check in too early, for other users, or twice', async () => {
      const booking = await p.book(10, 1, '2026-06-01T08:30:00', '2026-06-01T10:00:00');
      h.setNow('2026-06-01T08:14:00Z');
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, started(10, 1));
      expect((await row(booking.id)).checkedInAt).toBeNull();
      h.setNow('2026-06-01T08:20:00Z');
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, started(11, 2));
      expect((await row(booking.id)).checkedInAt).toBeNull();
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, started(10, 3));
      h.setNow('2026-06-01T08:40:00Z');
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, started(10, 4));
      expect((await row(booking.id)).checkedInUsageId).toBe(3);
    });

    it('does not check in at or after the end of the booking', async () => {
      const booking = await p.book(10, 1, '2026-06-01T08:30:00', '2026-06-01T09:00:00');
      h.setNow('2026-06-01T09:00:00Z');
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, started(10, 5));
      h.setNow('2026-06-01T09:30:00Z');
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, started(10, 6));
      expect((await row(booking.id)).checkedInAt).toBeNull();
    });

    it('counts a supervised start when the holder is the requester, and takeovers for the new user', async () => {
      const first = await p.book(10, 1, '2026-06-01T08:00:00', '2026-06-01T09:00:00');
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, started(10, 7, 77));
      expect((await row(first.id)).checkedInUsageId).toBe(7);

      const second = await p.book(11, 1, '2026-06-01T09:00:00', '2026-06-01T10:00:00');
      h.setNow('2026-06-01T09:00:00Z');
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_TAKEN_OVER, {
        resourceId: 1,
        usageId: 8,
        userId: 11,
        startTime: h.clock(),
        previousUsageId: 7,
        previousUserId: 10,
      });
      expect((await row(second.id)).checkedInUsageId).toBe(8);
    });

    it('checks in with a session that started before the window and ended inside the booking', async () => {
      const booking = await p.book(10, 1, '2026-06-01T09:00:00', '2026-06-01T10:00:00');
      const other = await p.book(11, 1, '2026-06-01T10:00:00', '2026-06-01T11:00:00');
      h.setNow('2026-06-01T09:05:00Z');
      const ended = (userId: number, usageId: number, startTime: string) => ({
        resourceId: 1,
        usageId,
        userId,
        startTime: new Date(startTime),
        endTime: h.clock(),
        reason: 'ended' as const,
      });
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_ENDED, ended(10, 31, '2026-06-01T08:00:00Z'));
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_ENDED, ended(11, 32, '2026-06-01T08:00:00Z'));
      expect(await row(booking.id)).toMatchObject({
        checkedInAt: new Date('2026-06-01T09:00:00Z'),
        checkedInUsageId: 31,
      });
      // Another user's booking, and a session that never reached the booking, do not count.
      expect((await row(other.id)).checkedInAt).toBeNull();
    });

    it('does not check in with a session that ended before the booking started', async () => {
      const booking = await p.book(10, 1, '2026-06-01T09:00:00', '2026-06-01T10:00:00');
      h.setNow('2026-06-01T08:50:00Z');
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_ENDED, {
        resourceId: 1,
        usageId: 33,
        userId: 10,
        startTime: new Date('2026-06-01T08:00:00Z'),
        endTime: h.clock(),
        reason: 'ended',
      });
      expect((await row(booking.id)).checkedInAt).toBeNull();
    });

    it('ignores resources without reservations', async () => {
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, { ...started(10), resourceId: 2 });
      expect(h.audit.record).not.toHaveBeenCalled();
    });
  });

  describe('override detection', () => {
    let booking: ReservationEntity;
    beforeEach(async () => {
      booking = await p.book(10, 1, '2026-06-01T08:00:00', '2026-06-01T10:00:00');
      h.setNow('2026-06-01T08:30:00Z');
    });

    it('audits and notifies the holder and the other managers, once per session', async () => {
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, started(99, 200));
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, started(99, 200));
      expect(
        (h.audit.record.mock.calls as unknown as [{ action: string }][]).filter(
          ([call]) => call.action === 'reservations.override_start',
        ),
      ).toHaveLength(1);
      expect(h.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'reservations.override_start',
          principal: expect.objectContaining({ userId: 99 }),
          subject: { type: 'reservations.reservation', id: booking.id },
        }),
      );
      expect(sent('override:').map((m) => m.recipients)).toEqual([[10]]);
      expect(sent('override-mgr').map((m) => m.recipients)).toEqual([[98]]);
      expect(sent('override:')[0].category).toBe('overrides');
    });

    it('ignores the holder, non-managers and idle bookings', async () => {
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, started(10, 201));
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, started(11, 202));
      h.setNow('2026-06-01T10:30:00Z');
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, started(99, 203));
      expect(sent('override')).toHaveLength(0);
    });
  });

  describe('pending keep/free decision', () => {
    let decisionService: PendingDecisionService;
    const actor = (userId: number) => ({ userId, authenticationMethod: 'session' as const });
    beforeEach(async () => {
      await p.book(10, 1, '2026-06-01T08:00:00', '2026-06-01T10:00:00');
      h.setNow('2026-06-01T08:30:00Z');
      decisionService = new PendingDecisionService(p.decisions, h.store, h.queries as ReservationQueryService, h.clock);
    });
    const ended = (userId: number, reason: 'ended' | 'taken_over' = 'ended') => ({
      resourceId: 1,
      usageId: 9,
      userId,
      startTime: new Date('2026-06-01T08:10:00Z'),
      endTime: h.clock(),
      reason,
    });

    it('records the holder’s question and serves the reservation', async () => {
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_ENDED, ended(10));
      expect(await decisionService.get(actor(10), 1)).toMatchObject({
        status: 'confirmed',
        mine: true,
        canEndEarly: true,
      });
      expect(await decisionService.get(actor(11), 1)).toBeNull();
    });

    it('ignores takeovers and other users', async () => {
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_ENDED, ended(10, 'taken_over'));
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_ENDED, ended(11));
      expect(await decisionService.get(actor(10), 1)).toBeNull();
    });

    it('expires after 15 minutes and clears on explicit answers and on the next session start', async () => {
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_ENDED, ended(10));
      h.setNow('2026-06-01T08:46:00Z');
      expect(await decisionService.get(actor(10), 1)).toBeNull();

      h.setNow('2026-06-01T08:30:00Z');
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_ENDED, ended(10));
      decisionService.clear(10, 1);
      expect(await decisionService.get(actor(10), 1)).toBeNull();

      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_ENDED, ended(10));
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, started(10, 300));
      expect(await decisionService.get(actor(10), 1)).toBeNull();
    });

    it('drops the question once the booking is gone', async () => {
      await h.emit(SystemEvent.RESOURCE_USAGE_SESSION_ENDED, ended(10));
      const [reservation] = await h.dataSource.getRepository(ReservationEntity).find();
      await h.reservations.endEarly(actor(10), reservation.id);
      expect(await decisionService.get(actor(10), 1)).toBeNull();
    });
  });

  describe('maintenance', () => {
    const maintenance = (
      maintenanceId: number,
      startTime: string,
      endTime: string | null,
      action: 'created' | 'updated' | 'finished' = 'created',
    ) => ({
      resourceId: 1,
      maintenanceId,
      action,
      startTime: new Date(`${startTime}Z`),
      endTime: endTime ? new Date(`${endTime}Z`) : null,
    });

    it('notifies holders of overlapping future, active and pending bookings exactly once per (booking, maintenance)', async () => {
      await h.settings.update(1, { approvalRequired: true });
      const pending = await p.book(10, 1, '2026-06-02T08:00:00', '2026-06-02T09:00:00');
      await h.settings.update(1, { approvalRequired: false });
      const confirmed = await p.book(11, 1, '2026-06-03T08:00:00', '2026-06-03T09:00:00');
      await p.book(12, 1, '2026-06-10T08:00:00', '2026-06-10T09:00:00'); // outside the window
      const cancelled = await p.book(13, 1, '2026-06-02T10:00:00', '2026-06-02T11:00:00');
      await h.reservations.cancel({ userId: 13, authenticationMethod: 'session' }, cancelled.id);

      const event = maintenance(5, '2026-06-02T00:00:00', '2026-06-04T00:00:00');
      await h.emit(SystemEvent.MAINTENANCE_CHANGED, event);
      await h.emit(SystemEvent.MAINTENANCE_CHANGED, event);
      await h.emit(SystemEvent.MAINTENANCE_CHANGED, { ...event, action: 'updated' });
      await p.newEvents().onMaintenance(event); // a restarted instance
      const mails = sent('maintenance');
      expect(mails.map((m) => m.recipients).sort()).toEqual([[10], [11]]);
      expect(mails.map((m) => m.dedupeKey).sort()).toEqual(
        [`reservations:maintenance:${pending.id}:5`, `reservations:maintenance:${confirmed.id}:5`].sort(),
      );
      expect(mails[0].category).toBe('availability');

      // another maintenance window notifies again
      await h.emit(SystemEvent.MAINTENANCE_CHANGED, maintenance(6, '2026-06-02T00:00:00', '2026-06-04T00:00:00'));
      expect(sent('maintenance')).toHaveLength(4);
    });

    it('sends one mail per holder listing all of their affected bookings, and later only the newly affected ones', async () => {
      const first = await p.book(10, 1, '2026-06-02T08:00:00', '2026-06-02T09:00:00');
      await p.book(10, 1, '2026-06-03T10:00:00', '2026-06-03T11:00:00');
      await p.book(11, 1, '2026-06-03T08:00:00', '2026-06-03T09:00:00');
      const event = maintenance(5, '2026-06-02T00:00:00', '2026-06-04T00:00:00');
      await h.emit(SystemEvent.MAINTENANCE_CHANGED, event);
      const claim = jest.spyOn(h.store, 'claimNotice');
      await p.newEvents().onMaintenance(event); // a restarted instance does not tell them again
      expect(claim).not.toHaveBeenCalled(); // already-told bookings are read, not claimed again
      const mails = () => sent('maintenance') as (Dispatched & { email: { variables: Record<string, never> } })[];
      expect(
        mails()
          .map((m) => m.recipients)
          .sort(),
      ).toEqual([[10], [11]]);
      const toHolder = mails().find((m) => m.recipients[0] === 10);
      expect(toHolder?.dedupeKey).toBe(`reservations:maintenance:${first.id}:5`);
      expect(toHolder?.body).toContain('These bookings of yours overlap this period');
      expect(toHolder?.email.variables['maintenance']).toMatchObject({
        single: false,
        bookings: 'Tue, 2 Jun 2026, 10:00 CEST – 11:00; Wed, 3 Jun 2026, 12:00 CEST – 13:00',
      });

      // The window grows: only the newly affected booking is named, in its own mail.
      const later = await p.book(10, 1, '2026-06-05T08:00:00', '2026-06-05T09:00:00');
      await h.emit(SystemEvent.MAINTENANCE_CHANGED, {
        ...maintenance(5, '2026-06-02T00:00:00', '2026-06-06T00:00:00'),
        action: 'updated',
      });
      expect(claim).toHaveBeenCalledTimes(1);
      const update = mails().at(-1);
      expect(update?.dedupeKey).toBe(`reservations:maintenance:${later.id}:5`);
      expect(update?.email.variables['maintenance']).toMatchObject({ single: true });
      expect(update?.body).toContain('Your booking (Fri, 5 Jun 2026, 10:00 CEST – 11:00) overlaps');
    });

    it('still tells the other holders when the notice to one holder fails, and does not retry that one', async () => {
      const failing = await p.book(11, 1, '2026-06-02T08:00:00', '2026-06-02T09:00:00'); // told first
      await p.book(10, 1, '2026-06-02T10:00:00', '2026-06-02T11:00:00');
      await p.book(10, 1, '2026-06-03T10:00:00', '2026-06-03T11:00:00');
      await p.book(12, 1, '2026-06-03T12:00:00', '2026-06-03T13:00:00');
      h.dispatch.mockImplementation(async (request) => {
        if ((request as Dispatched).recipients.includes(11)) throw new Error('mail server down');
        return undefined;
      });
      const event = maintenance(5, '2026-06-02T00:00:00', '2026-06-04T00:00:00');

      await expect(p.events.onMaintenance(event)).resolves.toBeUndefined();
      expect(sent('maintenance').map((m) => m.recipients)).toEqual([[11], [10], [12]]);

      // Claimed before sending (at most once): the failed holder's booking stays marked as told.
      const notices = await h.store.findNotices([failing.id], 'maintenance');
      expect(notices.map((notice) => notice.refKey)).toEqual(['5']);
      h.dispatch.mockClear();
      await h.emit(SystemEvent.MAINTENANCE_CHANGED, { ...event, action: 'updated' });
      expect(sent('maintenance')).toEqual([]);
    });

    it('covers open-ended maintenance and ignores finished events', async () => {
      await p.book(10, 1, '2026-06-20T08:00:00', '2026-06-20T09:00:00');
      await h.emit(SystemEvent.MAINTENANCE_CHANGED, maintenance(7, '2026-06-02T00:00:00', null, 'finished'));
      expect(sent('maintenance')).toHaveLength(0);
      await h.emit(SystemEvent.MAINTENANCE_CHANGED, maintenance(7, '2026-06-02T00:00:00', null));
      expect(sent('maintenance')).toHaveLength(1);
      expect(sent('maintenance')[0].body).toContain('no end announced yet');
    });

    it('does not cancel anything', async () => {
      const booking = await p.book(10, 1, '2026-06-02T08:00:00', '2026-06-02T09:00:00');
      await h.emit(SystemEvent.MAINTENANCE_CHANGED, maintenance(5, '2026-06-02T00:00:00', '2026-06-04T00:00:00'));
      expect((await row(booking.id)).status).toBe('confirmed');
    });
  });

  describe('health', () => {
    const health = (
      status: 'healthy' | 'unhealthy',
      previousStatus: 'healthy' | 'unhealthy' | null,
      identifier = 'mqtt',
    ) =>
      ({
        resourceId: 1,
        status,
        previousStatus,
        reason: status === 'unhealthy' ? 'Door sensor offline' : null,
        identifier,
      }) as unknown as ResourceHealthChangedPayload;

    it('notifies holders of active bookings and bookings starting within 24h, then tells the same holders on recovery', async () => {
      h.setNow('2026-06-01T06:00:00Z');
      await p.book(10, 1, '2026-06-01T07:00:00', '2026-06-01T09:00:00'); // active at 08:00
      await p.book(11, 1, '2026-06-02T07:00:00', '2026-06-02T08:00:00'); // starts in 23h
      await p.book(12, 1, '2026-06-02T09:00:00', '2026-06-02T10:00:00'); // starts in 25h
      h.setNow('2026-06-01T08:00:00Z');
      await h.emit(SystemEvent.RESOURCE_HEALTH_CHANGED, health('unhealthy', 'healthy'));
      await h.emit(SystemEvent.RESOURCE_HEALTH_CHANGED, health('unhealthy', 'healthy')); // duplicate delivery
      await p.newEvents().onHealth(health('unhealthy', 'healthy')); // restart
      expect(
        sent('health-unhealthy')
          .map((m) => m.recipients)
          .sort(),
      ).toEqual([[10], [11]]);
      expect(sent('health-unhealthy')[0].body).toContain('Door sensor offline');

      await h.emit(SystemEvent.RESOURCE_HEALTH_CHANGED, health('healthy', 'unhealthy'));
      await h.emit(SystemEvent.RESOURCE_HEALTH_CHANGED, health('healthy', 'unhealthy'));
      expect(
        sent('health-recovered')
          .map((m) => m.recipients)
          .sort(),
      ).toEqual([[10], [11]]);
    });

    it('notifies again for a later outage but not twice for the same one', async () => {
      h.setNow('2026-06-01T06:00:00Z');
      await p.book(10, 1, '2026-06-01T07:00:00', '2026-06-01T11:00:00');
      h.setNow('2026-06-01T08:00:00Z');
      await h.emit(SystemEvent.RESOURCE_HEALTH_CHANGED, health('unhealthy', 'healthy'));
      await h.emit(SystemEvent.RESOURCE_HEALTH_CHANGED, health('healthy', 'unhealthy'));
      h.setNow('2026-06-01T10:00:00Z');
      await h.emit(SystemEvent.RESOURCE_HEALTH_CHANGED, health('unhealthy', 'healthy'));
      await h.emit(SystemEvent.RESOURCE_HEALTH_CHANGED, health('healthy', 'unhealthy'));
      expect(sent('health-unhealthy')).toHaveLength(2);
      expect(sent('health-recovered')).toHaveLength(2);
    });

    it('waits for the last unhealthy entry before announcing recovery, and skips holders never told', async () => {
      h.setNow('2026-06-01T06:00:00Z');
      await p.book(10, 1, '2026-06-01T07:00:00', '2026-06-01T11:00:00');
      h.setNow('2026-06-01T08:00:00Z');
      await h.emit(SystemEvent.RESOURCE_HEALTH_CHANGED, health('unhealthy', 'healthy', 'a'));
      p.info.unhealthy = 1;
      await h.emit(SystemEvent.RESOURCE_HEALTH_CHANGED, health('healthy', 'unhealthy', 'a'));
      expect(sent('health-recovered')).toHaveLength(0);
      p.info.unhealthy = 0;
      await h.emit(SystemEvent.RESOURCE_HEALTH_CHANGED, health('healthy', 'unhealthy', 'b'));
      expect(sent('health-recovered')).toHaveLength(1);

      await p.book(11, 1, '2026-06-01T21:00:00', '2026-06-01T22:00:00'); // booked after the outage
      await h.emit(SystemEvent.RESOURCE_HEALTH_CHANGED, health('healthy', 'unhealthy', 'b'));
      expect(sent('health-recovered')).toHaveLength(1);
    });
  });
});
