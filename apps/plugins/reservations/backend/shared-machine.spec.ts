import type { PreStartContext, ReaderUiContext, StartBlockedContext } from '@attraccess/plugins-backend-sdk';
import { READER_UI_CAPABILITIES_NONE, SystemEvent } from '@attraccess/plugins-backend-sdk';
import { CAPACITY_REDUCED_REASON } from './constants';
import { createHostTransactionScope } from '@attraccess/plugins-backend-sdk/sqlite';
import { ReservationEntity } from './entities/reservation.entity';
import { overrideStepKey, reservationStepKey } from './hooks/pre-start.service';
import { ReservationError } from './reservations/errors';
import { BackgroundServices, createBackgroundServices } from './testing/background-services.test-utils';
import { Harness, at, createHarness, principal } from './testing/harness.test-utils';

/** ATT-1197: a booking holds one slot of a machine with several parallel sessions. */
describe('shared machine reservations', () => {
  let h: Harness;
  let p: BackgroundServices;

  const codeOf = async (promise: Promise<unknown>): Promise<string> => {
    try {
      await promise;
    } catch (error) {
      if (error instanceof ReservationError) return error.code;
      throw error;
    }
    return 'NO_ERROR';
  };
  const book = (userId: number, startHour: number, endHour: number, day = '2026-06-02') =>
    h.reservations.create(principal(userId), {
      resourceId: 1,
      startTime: at(`${day}T${String(startHour).padStart(2, '0')}:00:00`),
      endTime: at(`${day}T${String(endHour).padStart(2, '0')}:00:00`),
    });
  /** A booking at arbitrary times (`HH:MM` on 2026-06-02 unless a full date is given). */
  const bookAt = (userId: number, start: string, end: string) =>
    h.reservations.create(principal(userId), {
      resourceId: 1,
      startTime: at(start.includes('T') ? start : `2026-06-02T${start}:00`),
      endTime: at(end.includes('T') ? end : `2026-06-02T${end}:00`),
    });
  const statusOf = async (id: number) =>
    (await h.dataSource.getRepository(ReservationEntity).findOneByOrFail({ id })).status;
  const session = (userId: number, usageId = userId) => ({
    usageId,
    resourceId: 1,
    userId,
    startTime: new Date('2026-06-01T09:00:00Z'),
  });

  beforeEach(async () => {
    h = await createHarness();
    p = createBackgroundServices(h);
    await h.enable(1, { confirmWindowMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 });
    await h.settings.warmUp();
    h.makeManager(99, 1);
    h.setLimit(1, 3);
  });
  afterEach(() => h.close());

  describe('booking capacity', () => {
    it('accepts up to N overlapping bookings and refuses the next with OVERLAP', async () => {
      await book(10, 8, 10);
      await book(11, 8, 10);
      await book(12, 9, 11);
      expect(await codeOf(book(13, 9, 10))).toBe('OVERLAP');
      expect((await book(13, 11, 12)).status).toBe('confirmed');
    });

    it('counts bookings that do not overlap each other as one slot (concurrency sweep)', async () => {
      h.setLimit(1, 2);
      await book(10, 8, 9);
      await book(11, 9, 10);
      await book(12, 8, 10); // overlaps both, but they never overlap each other
      expect(await codeOf(book(13, 8, 10))).toBe('OVERLAP');
      expect((await book(13, 10, 11)).status).toBe('confirmed');
    });

    it('applies the buffers of both bookings to the sweep', async () => {
      h.setLimit(1, 2);
      await book(10, 8, 9);
      await book(11, 8, 9);
      await h.settings.update(1, { bufferAfterMinutes: 30 });
      // Existing bookings were stored without buffers; the new one blocks [9:00-0, 10:30) with its own buffer.
      expect(await codeOf(book(12, 9, 10))).toBe('NO_ERROR');
    });

    it("counts the new booking's buffer before against bookings that end at its start", async () => {
      h.setLimit(1, 2);
      await book(10, 8, 9);
      await book(11, 8, 9);
      await h.settings.update(1, { bufferBeforeMinutes: 30 });
      // The new booking blocks [8:30, 10:00): both 8-9 bookings are open at 8:30.
      expect(await codeOf(book(12, 9, 10))).toBe('OVERLAP');
    });

    it("counts a stored booking's buffer after that reaches into the new span", async () => {
      h.setLimit(1, 2);
      await h.settings.update(1, { bufferAfterMinutes: 30 });
      await book(10, 8, 9); // blocks [8:00, 9:30)
      await h.settings.update(1, { bufferAfterMinutes: 0 });
      await book(11, 9, 10);
      expect(await codeOf(book(12, 9, 10))).toBe('OVERLAP');
      expect(await codeOf(book(12, 10, 11))).toBe('NO_ERROR');
    });

    it('lets pending requests occupy a slot', async () => {
      h.setLimit(1, 2);
      await book(10, 8, 10);
      await h.settings.update(1, { approvalRequired: true });
      expect((await book(11, 8, 10)).status).toBe('pending');
      await h.settings.update(1, { approvalRequired: false });
      expect(await codeOf(book(12, 9, 10))).toBe('OVERLAP');
    });

    it('refuses a second overlapping booking of the same person with OWN_OVERLAP', async () => {
      await book(10, 8, 10);
      expect(await codeOf(book(10, 9, 11))).toBe('OWN_OVERLAP');
      expect((await book(10, 10, 11)).status).toBe('confirmed');
    });

    it('keeps OVERLAP for a single-slot machine, even for the same person', async () => {
      h.setLimit(1, 1);
      await book(10, 8, 10);
      expect(await codeOf(book(10, 9, 11))).toBe('OVERLAP');
      expect(await codeOf(book(11, 9, 11))).toBe('OVERLAP');
    });

    it('never exceeds N under concurrent creates', async () => {
      const results = await Promise.allSettled([10, 11, 12, 13, 14, 15].map((user) => book(user, 8, 9)));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
      for (const result of results) {
        if (result.status === 'rejected') expect((result.reason as ReservationError).code).toBe('OVERLAP');
      }
    });

    it('reads the limit again on every create (a raised limit frees slots)', async () => {
      h.setLimit(1, 1);
      await book(10, 8, 9);
      expect(await codeOf(book(11, 8, 9))).toBe('OVERLAP');
      h.setLimit(1, 2);
      expect(await codeOf(book(11, 8, 9))).toBe('NO_ERROR');
    });
  });

  describe('availability', () => {
    it('exposes the effective limit as slots', async () => {
      const view = await h.queries.availability(principal(10), 1, at('2026-06-02T00:00:00'), at('2026-06-03T00:00:00'));
      expect(view.slots).toBe(3);
      h.setLimit(1, 1);
      expect(
        (await h.queries.availability(principal(10), 1, at('2026-06-02T00:00:00'), at('2026-06-03T00:00:00'))).slots,
      ).toBe(1);
    });
  });

  describe('lowering the limit', () => {
    const lower = (from: number, to: number, actorUserId: number | null = 99) => {
      h.setLimit(1, to);
      return h.emit(SystemEvent.RESOURCE_SESSION_LIMIT_CHANGED, {
        resourceId: 1,
        previousLimit: from,
        newLimit: to,
        actorUserId,
      });
    };

    beforeEach(() => p.events.subscribe());

    it('cancels the newest bookings that no longer fit, audits and notifies each', async () => {
      const a = await book(10, 8, 10);
      const b = await book(11, 8, 10);
      const c = await book(12, 8, 10);
      await lower(3, 2);
      await h.reservations.flushNotifications();
      expect(await statusOf(c.id)).toBe('cancelled');
      expect(await statusOf(a.id)).toBe('confirmed');
      expect(await statusOf(b.id)).toBe('confirmed');
      const row = await h.dataSource.getRepository(ReservationEntity).findOneByOrFail({ id: c.id });
      expect(row).toMatchObject({ cancelledBy: 99, cancelReason: CAPACITY_REDUCED_REASON });
      expect(h.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'reservations.cancelled',
          principal: { userId: 99, authenticationMethod: 'session' },
          details: expect.objectContaining({ reason: CAPACITY_REDUCED_REASON, bulk: true, holderUserId: 12 }),
        }),
      );
      expect(h.notifier.onRemoved).toHaveBeenCalledTimes(1);
      expect(h.notifier.onRemoved).toHaveBeenCalledWith(expect.objectContaining({ id: c.id }), {
        byUserId: null,
        reason: CAPACITY_REDUCED_REASON,
      });
      expect(h.invalidateStartBlocked).toHaveBeenCalledWith({ resourceId: 1 });
    });

    it('cancels only as many bookings as it takes (newest first, running ones stay)', async () => {
      const running1 = await book(10, 8, 10);
      const running2 = await book(11, 8, 10);
      const future = await book(12, 9, 11);
      h.setNow('2026-06-02T08:30:00Z');
      await lower(3, 1);
      expect(await statusOf(running1.id)).toBe('confirmed');
      expect(await statusOf(running2.id)).toBe('confirmed');
      expect(await statusOf(future.id)).toBe('cancelled');
    });

    it('cancels nothing when the limit rises or the bookings still fit', async () => {
      const a = await book(10, 8, 10);
      await book(11, 8, 10);
      await lower(2, 3);
      await lower(3, 2);
      expect(await statusOf(a.id)).toBe('confirmed');
      expect(h.notifier.onRemoved).not.toHaveBeenCalled();
    });

    it('is repaired by the scheduler when the event was missed, attributed to the holder', async () => {
      await book(10, 8, 10);
      await book(11, 8, 10);
      const c = await book(12, 8, 10);
      h.setLimit(1, 2); // no event: the plugin was disabled or the server down
      await p.newScheduler().tick();
      expect(await statusOf(c.id)).toBe('cancelled');
      expect(h.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ principal: { userId: 12, authenticationMethod: 'session' } }),
      );
      await p.newScheduler().tick();
      expect(h.notifier.onRemoved).toHaveBeenCalledTimes(1);
    });

    it('counts pending requests and cancels them like confirmed bookings', async () => {
      await book(10, 8, 10);
      await book(11, 8, 10);
      await h.settings.update(1, { approvalRequired: true });
      const pending = await book(12, 8, 10);
      expect(pending.status).toBe('pending');
      await lower(3, 2);
      expect(await statusOf(pending.id)).toBe('cancelled');
    });

    it('never cancels a booking whose holder checked in early', async () => {
      await book(10, 8, 10);
      const b = await book(11, 8, 10);
      const c = await book(12, 8, 10);
      h.setNow('2026-06-02T07:50:00Z');
      await h.reservations.markCheckedIn(c.id, 300, h.clock());
      await lower(3, 2);
      expect(await statusOf(c.id)).toBe('confirmed');
      expect(await statusOf(b.id)).toBe('cancelled');
    });

    it('leaves the bookings of a deleted resource alone', async () => {
      const a = await book(10, 8, 10);
      await book(11, 8, 10);
      h.deleteResource(1); // a deleted resource reads as limit 1 everywhere else
      await p.newScheduler().tick();
      expect(await h.reservations.cancelExcessBookings(1, null)).toBe(0);
      expect(await statusOf(a.id)).toBe('confirmed');
      expect(h.notifier.onRemoved).not.toHaveBeenCalled();
    });
  });

  describe('pre-start gate', () => {
    const ctx = (userId: number, patch: Partial<PreStartContext> = {}): PreStartContext => ({
      resourceId: 1,
      userId,
      principal: userId,
      action: 'start',
      origin: 'web',
      confirmedStepKeys: [],
      language: 'en',
      now: h.clock(),
      ...patch,
    });
    const blocked = (userId: number): StartBlockedContext => ({
      resourceId: 1,
      userId,
      principal: userId,
      language: 'en',
      now: h.clock(),
    });

    describe('running bookings', () => {
      let bob: ReservationEntity;
      beforeEach(async () => {
        bob = await book(11, 8, 10);
        h.setNow('2026-06-02T08:30:00Z');
      });

      it('allows a spontaneous start while a free slot remains', async () => {
        expect(await p.preStart.evaluate(ctx(10))).toEqual({ decision: 'allow' });
        expect(await p.preStart.evaluateStartBlocked(blocked(10))).toBeNull();
      });

      it('blocks when sessions plus held slots fill the machine, with the ATT-881 text', async () => {
        h.setLimit(1, 2);
        h.state.sessions.push(session(20));
        const verdict = await p.preStart.evaluate(ctx(10));
        expect(verdict).toMatchObject({ decision: 'block', reason: { code: 'RESERVED' } });
        expect((await p.preStart.evaluateStartBlocked(blocked(10)))?.reason.code).toBe('RESERVED');
      });

      it('does not count a holder who is in session twice', async () => {
        h.setLimit(1, 2);
        h.state.sessions.push(session(11));
        expect(await p.preStart.evaluate(ctx(10))).toEqual({ decision: 'allow' });
        expect(await p.preStart.evaluateStartBlocked(blocked(10))).toBeNull();
      });

      it('lets the holder use their own slot', async () => {
        h.setLimit(1, 2);
        h.state.sessions.push(session(20));
        expect(await p.preStart.evaluate(ctx(11))).toEqual({ decision: 'allow' });
        expect(await p.preStart.evaluateStartBlocked(blocked(11))).toBeNull();
      });

      it('asks a manager for the override and then lets the start through', async () => {
        h.setLimit(1, 2);
        h.state.sessions.push(session(20));
        const asked = await p.preStart.evaluate(ctx(99));
        expect(asked).toMatchObject({ decision: 'confirm', confirmation: { stepKey: overrideStepKey(bob.id) } });
        expect(await p.preStart.evaluate(ctx(99, { confirmedStepKeys: [overrideStepKey(bob.id)] }))).toEqual({
          decision: 'allow',
        });
        expect(await p.preStart.evaluateStartBlocked(blocked(99))).toBeNull();
      });

      it('does not hold a slot for a running pending request', async () => {
        h.setLimit(1, 2);
        h.state.sessions.push(session(20));
        await h.dataSource.getRepository(ReservationEntity).update(bob.id, { status: 'pending' });
        expect(await p.preStart.evaluate(ctx(10))).toEqual({ decision: 'allow' });
        expect(await p.preStart.evaluateStartBlocked(blocked(10))).toBeNull();
      });

      it('names nobody for a viewer who may not see who uses the machine', async () => {
        h.setLimit(1, 2);
        h.state.sessions.push(session(20));
        const verdict = await p.preStart.evaluate(ctx(10));
        expect(JSON.stringify(verdict)).not.toContain('user11');
      });
    });

    describe('upcoming bookings', () => {
      beforeEach(async () => {
        await book(11, 12, 14, '2026-06-01');
        h.setNow('2026-06-01T11:30:00Z');
      });

      it('asks only when starting now would leave the booking without a slot', async () => {
        h.setLimit(1, 2);
        h.state.sessions.push(session(20));
        const asked = await p.preStart.evaluate(ctx(10));
        expect(asked).toMatchObject({ decision: 'confirm', confirmation: { title: 'Reserved soon' } });
        h.setLimit(1, 3);
        expect(await p.preStart.evaluate(ctx(10))).toEqual({ decision: 'allow' });
      });

      it('stays quiet once that booking is confirmed in this attempt', async () => {
        h.setLimit(1, 2);
        h.state.sessions.push(session(20));
        const asked = await p.preStart.evaluate(ctx(10));
        const stepKey = (asked as { confirmation: { stepKey: string } }).confirmation.stepKey;
        expect(stepKey).toMatch(/^reservation-\d+$/);
        expect(await p.preStart.evaluate(ctx(10, { confirmedStepKeys: [stepKey] }))).toEqual({ decision: 'allow' });
        expect(stepKey).toBe(reservationStepKey(1));
      });

      it('counts the slots other bookings hold at that start', async () => {
        await book(12, 12, 14, '2026-06-01');
        h.setLimit(1, 3);
        // No session: the starter plus two held slots fit three.
        expect(await p.preStart.evaluate(ctx(10))).toEqual({ decision: 'allow' });
        h.state.sessions.push(session(20));
        expect(await p.preStart.evaluate(ctx(10))).toMatchObject({
          decision: 'confirm',
          confirmation: { title: 'Reserved soon' },
        });
      });

      it('counts a holder who is already in session once', async () => {
        await book(12, 12, 14, '2026-06-01');
        h.setLimit(1, 3);
        h.state.sessions.push(session(11));
        expect(await p.preStart.evaluate(ctx(10))).toEqual({ decision: 'allow' });
      });
    });

    describe('after a manager override', () => {
      it('does not count the overridden booking again at a later start', async () => {
        const bob = await book(11, 8, 10);
        const later = await book(13, 9, 10);
        h.setNow('2026-06-02T08:30:00Z');
        h.state.sessions.push(session(20));
        // One session, the manager, bob's slot and the 9:00 booking would need four slots.
        expect(await p.preStart.evaluate(ctx(99))).toMatchObject({
          decision: 'confirm',
          confirmation: { stepKey: reservationStepKey(later.id) },
        });
        // The manager's session takes bob's slot (e.g. confirmed while a second session still ran).
        expect(await p.preStart.evaluate(ctx(99, { confirmedStepKeys: [overrideStepKey(bob.id)] }))).toEqual({
          decision: 'allow',
        });
      });
    });
  });

  describe('atomic start capacity hook', () => {
    const capacity = (userId: number, occupiedSlots: number, patch: Record<string, unknown> = {}) =>
      p.startCapacity.evaluate({
        resourceId: 1,
        userId,
        principal: userId,
        scope: createHostTransactionScope(h.dataSource.manager),
        action: 'start',
        origin: 'web',
        sessionLimit: 2,
        occupiedSlots,
        usersInSession: [],
        confirmedStepKeys: [],
        language: 'en',
        now: h.clock(),
        ...patch,
      });
    let bob: ReservationEntity;

    beforeEach(async () => {
      h.setLimit(1, 2);
      bob = await book(11, 8, 10);
      h.setNow('2026-06-02T08:30:00Z');
    });

    it('answers how many slots are held for others, with a reason only when the machine would be full', async () => {
      expect(await capacity(10, 0)).toEqual({ heldSlots: 1 });
      expect(await capacity(10, 1)).toMatchObject({ heldSlots: 1, reason: { code: 'RESERVED' } });
    });

    it('holds nothing for the starter themself, for holders in session or after a confirmed override', async () => {
      expect(await capacity(11, 1)).toEqual({ heldSlots: 0 });
      expect(await capacity(10, 1, { usersInSession: [11] })).toEqual({ heldSlots: 0 });
      expect(await capacity(99, 1, { confirmedStepKeys: [overrideStepKey(bob.id)] })).toEqual({ heldSlots: 0 });
    });

    it('holds nothing when reservations are disabled for the resource', async () => {
      await h.settings.update(1, { enabled: false });
      expect(await capacity(10, 1)).toEqual({ heldSlots: 0 });
    });

    it('reads bookings through the given manager, in one query', async () => {
      const read = jest.spyOn(h.store, 'findRunningConfirmed');
      await capacity(10, 0);
      expect(read).toHaveBeenCalledTimes(1);
      expect(read).toHaveBeenCalledWith(h.dataSource.manager, 1, expect.any(Date));
    });

    it('holds no slot for a running pending request', async () => {
      await h.dataSource.getRepository(ReservationEntity).update(bob.id, { status: 'pending' });
      expect(await capacity(10, 1)).toEqual({ heldSlots: 0 });
    });
  });

  describe('manager override detection', () => {
    const start = (userId: number, usageId: number) => {
      h.state.sessions.push(session(userId, usageId));
      return h.emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, {
        resourceId: 1,
        usageId,
        userId,
        startTime: h.clock(),
      });
    };
    const overrides = () =>
      (h.audit.record.mock.calls as unknown as [{ action: string; subject: { id: number } }][])
        .map(([call]) => call)
        .filter((call) => call.action === 'reservations.override_start');
    let carol: ReservationEntity;

    beforeEach(async () => {
      p.events.subscribe();
      await book(11, 8, 10);
      carol = await book(12, 8, 9);
      h.setNow('2026-06-02T08:30:00Z');
    });

    it("records nothing when a manager's start found a free slot", async () => {
      await start(99, 200);
      expect(overrides()).toHaveLength(0);
      expect(h.notifier.onRemoved).not.toHaveBeenCalled();
      expect(h.dispatch).not.toHaveBeenCalled();
    });

    it('records nothing when a manager starts in their own booking, even on a full machine', async () => {
      h.setNow('2026-06-01T11:30:00Z');
      await book(99, 8, 10);
      h.setNow('2026-06-02T08:30:00Z');
      h.state.sessions.push(session(20));
      await start(99, 200);
      expect(overrides()).toHaveLength(0);
      expect(h.dispatch).not.toHaveBeenCalled();
    });

    it('records the override of the booking whose slot the start took, the one the gate asked about first', async () => {
      h.state.sessions.push(session(20));
      await start(99, 200);
      // One other session and two held slots fill three: carol's booking ends first, so it is named.
      expect(overrides().map((call) => call.subject.id)).toEqual([carol.id]);
    });
  });

  describe('notices', () => {
    const sent = (prefix: string) =>
      h.dispatch.mock.calls
        .map(([request]) => request as { recipients: number[]; dedupeKey: string })
        .filter((r) => r.dedupeKey.startsWith(`reservations:${prefix}`));

    it('sends the handover reminder only when the booking would find no free slot', async () => {
      await book(10, 12, 14, '2026-06-01');
      h.state.sessions.push(session(12));
      h.setNow('2026-06-01T11:50:00Z');
      await p.scheduler.tick();
      expect(sent('handover')).toHaveLength(0); // 1 of 3 slots in use: the booking has a slot
      h.setLimit(1, 1);
      await p.scheduler.tick();
      expect(sent('handover')).toHaveLength(1);
    });

    it('counts slots held by other bookings for the handover reminder', async () => {
      h.setLimit(1, 2);
      await book(10, 12, 14, '2026-06-01');
      await book(11, 12, 14, '2026-06-01');
      h.state.sessions.push(session(12));
      h.setNow('2026-06-01T11:50:00Z');
      await p.scheduler.tick();
      // Both bookings find no free slot: one reminder each, to the user with a running session.
      expect(sent('handover:').map((m) => m.recipients)).toEqual([[12], [12]]);
    });

    it('sends the overrun notice only when the holder has no session and no slot was free', async () => {
      h.setLimit(1, 2);
      await book(10, 12, 14, '2026-06-01');
      h.state.sessions.push({ ...session(12), startTime: new Date('2026-06-01T10:00:00Z') });
      h.setNow('2026-06-01T12:01:00Z');
      await p.scheduler.tick();
      expect(sent('overrun')).toHaveLength(0); // one slot is still free for the holder
      h.state.sessions.push({ ...session(13), startTime: new Date('2026-06-01T10:30:00Z') });
      await p.scheduler.tick();
      expect(sent('overrun').map((m) => m.recipients)).toEqual([[10], [12, 13]]); // holder, then lingering users
    });
  });

  describe('reader', () => {
    const ctx = (patch: Partial<ReaderUiContext> = {}): ReaderUiContext => ({
      readerId: 1,
      resourceId: 1,
      capabilities: READER_UI_CAPABILITIES_NONE,
      language: 'en',
      ...patch,
    });
    const gate = (userId: number): PreStartContext => ({
      resourceId: 1,
      userId,
      principal: userId,
      action: 'start',
      origin: 'reader',
      confirmedStepKeys: [],
      language: 'en',
      now: h.clock(),
    });
    const rowText = (list: Awaited<ReturnType<BackgroundServices['readerUi']['getSlotContributions']>>) =>
      (list.find((c) => c.slotId === 'resourceList.row.status')?.tree as { text: string }).text;

    beforeEach(async () => {
      await book(11, 8, 10);
      h.setNow('2026-06-02T08:30:00Z');
    });

    it('shows a success count while slots remain free and the reserved warning once none is left', async () => {
      const free = await p.readerUi.getSlotContributions(ctx({ userId: 10 }));
      expect(rowText(free)).toBe('1/3 reserved');
      expect(free[0].fallback?.tone).toBe('success');
      h.setLimit(1, 2);
      h.state.sessions.push(session(20));
      const full = await p.readerUi.getSlotContributions(ctx({ userId: 10 }));
      expect(rowText(full)).toMatch(/^Reserved until/);
      expect(full[0].fallback?.tone).toBe('warning');
    });

    it('treats a signed-out reader as nobody: warning only when no slot is free at all', async () => {
      h.setLimit(1, 1);
      expect(rowText(await p.readerUi.getSlotContributions(ctx()))).toMatch(/^Reserved until/);
      h.setLimit(1, 3);
      expect(rowText(await p.readerUi.getSlotContributions(ctx()))).toBe('1/3 reserved');
    });

    it('expires at every booking start and end', async () => {
      const list = await p.readerUi.getSlotContributions(ctx({ userId: 10 }));
      expect(list[0].expiresAt?.toISOString()).toBe('2026-06-02T10:00:00.000Z');
    });

    it('expires at the earliest booking start or end that changes the free slots', async () => {
      h.setNow('2026-06-02T07:00:00Z');
      await bookAt(12, '08:00', '09:15');
      h.setNow('2026-06-02T08:30:00Z');
      const ending = await p.readerUi.getSlotContributions(ctx({ userId: 10 }));
      expect(ending[0].expiresAt?.toISOString()).toBe('2026-06-02T09:15:00.000Z');
      await bookAt(13, '09:00', '11:00');
      const starting = await p.readerUi.getSlotContributions(ctx({ userId: 10 }));
      expect(starting[0].expiresAt?.toISOString()).toBe('2026-06-02T09:00:00.000Z');
    });

    it("shows the viewer's own running booking, even when another one started earlier", async () => {
      h.setNow('2026-06-02T07:00:00Z');
      await bookAt(10, '08:15', '10:00');
      h.setNow('2026-06-02T08:30:00Z');
      const list = await p.readerUi.getSlotContributions(ctx({ userId: 10 }));
      expect(rowText(list)).toMatch(/^Your booking/);
      expect(list[0].fallback?.tone).toBe('primary');
    });

    it("names the booking that leaves the viewer no slot instead of the viewer's upcoming one", async () => {
      h.setLimit(1, 2);
      await book(10, 10, 11);
      h.setNow('2026-06-02T09:50:00Z'); // inside the early check-in window of the viewer's booking
      expect(rowText(await p.readerUi.getSlotContributions(ctx({ userId: 10 })))).toMatch(/^Your booking/);
      h.state.sessions.push(session(20));
      const list = await p.readerUi.getSlotContributions(ctx({ userId: 10 }));
      expect(rowText(list)).toMatch(/^Reserved until/);
      expect(list[0].fallback?.tone).toBe('warning');
    });

    it('shows an upcoming booking that would lack its slot instead of the count, as the gate asks', async () => {
      h.setLimit(1, 2);
      await book(12, 9, 10);
      // Bob's booking runs and one slot is free, but starting now leaves the 9:00 booking without one.
      const list = await p.readerUi.getSlotContributions(ctx({ userId: 10 }));
      expect(rowText(list)).toMatch(/^Free until/);
      expect(await p.preStart.evaluate(gate(10))).toMatchObject({
        decision: 'confirm',
        confirmation: { title: 'Reserved soon' },
      });
    });

    it('counts the slot a viewer without a session would take for the countdown', async () => {
      await book(12, 11, 12);
      h.setNow('2026-06-02T10:30:00Z');
      h.setLimit(1, 2);
      h.state.sessions.push(session(20)); // someone else's usage: the viewer is not in session
      const list = await p.readerUi.getSlotContributions(ctx({ userId: 10, sessionActive: true }));
      expect(list.find((c) => c.slotId === 'resource.details.session')).toBeDefined();
      expect(await p.preStart.evaluate(gate(10))).toMatchObject({ decision: 'confirm' });
    });

    it('keeps the count text German and Latin-1 within the row limit', async () => {
      const list = await p.readerUi.getSlotContributions(ctx({ userId: 10, language: 'de' }));
      expect(rowText(list)).toBe('1/3 reserviert');
      expect(rowText(list)).toMatch(/^[\u0020-\u007e\u00a1-\u00ff]+$/);
      expect(rowText(list).length).toBeLessThanOrEqual(24);
    });

    it('counts down to an upcoming booking only when the viewer session would take its slot', async () => {
      await book(12, 11, 12, '2026-06-02');
      h.setNow('2026-06-02T10:30:00Z');
      const session1 = session(10);
      h.state.sessions.push(session1);
      const calm = await p.readerUi.getSlotContributions(ctx({ userId: 10, sessionActive: true }));
      expect(calm.find((c) => c.slotId === 'resource.details.session')).toBeUndefined();
      h.setLimit(1, 2);
      h.state.sessions.push(session(20));
      const tight = await p.readerUi.getSlotContributions(ctx({ userId: 10, sessionActive: true }));
      expect(tight.find((c) => c.slotId === 'resource.details.session')).toBeDefined();
    });
  });
});
