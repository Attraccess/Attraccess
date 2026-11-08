import {
  READER_UI_LIMITS,
  type PreStartContext,
  type StartBlockedContext,
  type StartBlockedState,
} from '@attraccess/plugins-backend-sdk';
import { ReservationEntity } from '../entities/reservation.entity';
import { Harness, createHarness } from '../testing/harness.test-utils';
import { BackgroundServices, createBackgroundServices } from '../testing/background-services.test-utils';
import { PreStartService, overrideStepKey, reservationStepKey } from './pre-start.service';

describe('PreStartService', () => {
  let h: Harness;
  let p: BackgroundServices;

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

  beforeEach(async () => {
    h = await createHarness();
    p = createBackgroundServices(h);
    await h.enable(1, { confirmWindowMinutes: 60 });
    await h.settings.warmUp();
    h.makeManager(99, 1);
  });
  afterEach(() => h.close());

  it('allows without any database access when reservations are disabled', async () => {
    const getRepository = jest.spyOn(h.dataSource, 'getRepository');
    const query = jest.spyOn(h.store, 'findConfirmedOverlapping');
    const isManager = jest.spyOn(h.access, 'isManager');
    expect(await p.preStart.evaluate(ctx(10, { resourceId: 2 }))).toEqual({ decision: 'allow' });
    expect(getRepository).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(isManager).not.toHaveBeenCalled();
  });

  it('answers disabled resources from memory on every call (perf sanity)', async () => {
    const getRepository = jest.spyOn(h.dataSource, 'getRepository');
    const started = process.hrtime.bigint();
    for (let i = 0; i < 5000; i += 1) await p.preStart.evaluate(ctx(10, { resourceId: 2 }));
    const perCallMs = Number(process.hrtime.bigint() - started) / 1e6 / 5000;
    expect(getRepository).not.toHaveBeenCalled();
    // Generous bound: the call count above is the real guarantee; this only catches pathological slowness
    // (coverage instrumentation and loaded CI hosts are far below it).
    expect(perCallMs).toBeLessThan(20);
  });

  it('uses exactly one indexed query for an enabled resource without conflicts', async () => {
    const query = jest.spyOn(h.store, 'findConfirmedOverlapping');
    const isManager = jest.spyOn(h.access, 'isManager');
    expect(await p.preStart.evaluate(ctx(10))).toEqual({ decision: 'allow' });
    expect(query).toHaveBeenCalledTimes(1);
    expect(isManager).not.toHaveBeenCalled();
  });

  it('does not wrongly allow before the settings cache is warm', async () => {
    const cold = new PreStartService(
      Object.assign(Object.create(Object.getPrototypeOf(h.settings)), h.settings, {
        warmed: null,
        warm: false,
        cache: new Map(),
      }),
      h.globalSettings,
      h.store,
      h.access,
      h.directory,
      h.visibility,
      h.clock,
    );
    await p.book(11, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
    h.setNow('2026-06-01T12:30:00Z');
    expect(await cold.evaluate(ctx(10))).toMatchObject({ decision: 'block' });
  });

  describe('active booking of another user', () => {
    beforeEach(async () => {
      await p.book(11, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T12:30:00Z');
    });

    it('blocks non-managers with code RESERVED and never names the holder', async () => {
      const result = await p.preStart.evaluate(ctx(10));
      expect(result).toEqual({
        decision: 'block',
        reason: { code: 'RESERVED', title: 'Reserved', body: 'Reserved by another user until 16:00.' },
      });
      expect(JSON.stringify(result)).not.toContain('user11');
    });

    it("names the holder to a viewer who may see the machine's current user (core attribution rule), en + de", async () => {
      h.allowAttribution(10, 1);
      expect(await p.preStart.evaluate(ctx(10))).toEqual({
        decision: 'block',
        reason: { code: 'RESERVED', title: 'Reserved', body: 'Reserved by user11 until 16:00.' },
      });
      expect(await p.preStart.evaluate(ctx(10, { language: 'de' }))).toMatchObject({
        reason: { body: 'Von user11 bis 16:00 reserviert.' },
      });
      // Someone else without that access still gets the anonymous text.
      const other = await p.preStart.evaluate(ctx(12));
      expect(other).toMatchObject({ reason: { body: 'Reserved by another user until 16:00.' } });
      expect(JSON.stringify(other)).not.toContain('user11');
    });

    it('names the holder per resource: attribution on another machine does not count', async () => {
      h.allowAttribution(10, 2);
      const result = await p.preStart.evaluate(ctx(10));
      expect(JSON.stringify(result)).not.toContain('user11');
    });

    it('speaks German to German users', async () => {
      const result = await p.preStart.evaluate(ctx(10, { language: 'de' }));
      expect(result).toMatchObject({
        decision: 'block',
        reason: { body: 'Von einer anderen Person bis 16:00 reserviert.' },
      });
    });

    it('asks managers for an override confirmation naming the holder', async () => {
      const [reservation] = await h.dataSource.getRepository(ReservationEntity).find();
      const result = await p.preStart.evaluate(ctx(99));
      expect(result).toMatchObject({
        decision: 'confirm',
        confirmation: {
          stepKey: `override-${reservation.id}`,
          body: 'Reserved by user11 until 16:00. Start anyway?',
          noScreenPolicy: 'block',
        },
      });
      expect(await p.preStart.evaluate(ctx(99, { confirmedStepKeys: [`override-${reservation.id}`] }))).toEqual({
        decision: 'allow',
      });
    });

    it('treats resources.update holders as managers, but not holders of the global maintenance permission', async () => {
      h.grant(50, 'resources.update');
      h.grant(51, 'resources.maintenance.manage');
      expect(await p.preStart.evaluate(ctx(50))).toMatchObject({ decision: 'confirm' });
      expect(await p.preStart.evaluate(ctx(51))).toMatchObject({ decision: 'block' });
    });

    it('applies the starter’s API-token scope: no override and no name for a token without those permissions', async () => {
      h.grant(50, 'resources.update');
      h.allowAttribution(50, 1);
      const narrow = { id: 50, effectivePermissions: ['resources.maintenance.manage'] };
      const result = await p.preStart.evaluate(ctx(50, { principal: narrow, origin: 'api' }));
      expect(result).toEqual({
        decision: 'block',
        reason: { code: 'RESERVED', title: 'Reserved', body: 'Reserved by another user until 16:00.' },
      });
      // The same user through a session (or a token that carries the permission) keeps the override.
      const full = { id: 50, effectivePermissions: ['resources.update'] };
      expect(await p.preStart.evaluate(ctx(50, { principal: full, origin: 'api' }))).toMatchObject({
        decision: 'confirm',
      });
    });

    it('cuts a very long holder name, so the reason always fits the host’s text limit', async () => {
      const long = 'x'.repeat(200);
      jest.spyOn(h.directory, 'getUserNames').mockResolvedValue(new Map([[11, long]]));
      h.allowAttribution(10, 1);
      const result = await p.preStart.evaluate(ctx(10));
      expect(result).toMatchObject({ reason: { body: `Reserved by ${'x'.repeat(39)}… until 16:00.` } });
    });

    it('allows the holder, also on takeover', async () => {
      expect(await p.preStart.evaluate(ctx(11))).toEqual({ decision: 'allow' });
      expect(await p.preStart.evaluate(ctx(11, { action: 'takeover' }))).toEqual({ decision: 'allow' });
    });

    it('blocks takeovers and supervised starts of non-managers alike', async () => {
      expect(await p.preStart.evaluate(ctx(10, { action: 'takeover' }))).toMatchObject({ decision: 'block' });
      expect(await p.preStart.evaluate(ctx(10, { origin: 'supervision' }))).toMatchObject({ decision: 'block' });
    });

    it('only counts the end of the booking (a booking that ended no longer blocks)', async () => {
      h.setNow('2026-06-01T14:00:00Z');
      expect(await p.preStart.evaluate(ctx(10))).toEqual({ decision: 'allow' });
    });
  });

  describe('upcoming booking of another user', () => {
    beforeEach(async () => {
      await p.book(11, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
    });

    it('asks for confirmation inside the confirm window with a countdown', async () => {
      h.setNow('2026-06-01T11:20:00Z');
      const [reservation] = await h.dataSource.getRepository(ReservationEntity).find();
      const result = await p.preStart.evaluate(ctx(10));
      expect(result).toEqual({
        decision: 'confirm',
        confirmation: expect.objectContaining({
          stepKey: `reservation-${reservation.id}`,
          body: 'Reserved from 14:00, you have 40 min. Start anyway?',
          countdownTo: new Date('2026-06-01T12:00:00Z'),
          noScreenPolicy: 'block',
          confirmLabel: 'Start anyway',
          cancelLabel: 'Cancel',
          tone: 'warning',
        }),
      });
      const again = await p.preStart.evaluate(ctx(10, { confirmedStepKeys: [`reservation-${reservation.id}`] }));
      expect(again).toEqual({ decision: 'allow' });
    });

    it('uses step keys the host accepts (the host rejects anything else as an invalid hook result)', () => {
      expect(reservationStepKey(123456789)).toMatch(READER_UI_LIMITS.idPattern);
      expect(overrideStepKey(123456789)).toMatch(READER_UI_LIMITS.idPattern);
    });

    it('asks managers the normal confirmation (override is for running bookings only)', async () => {
      h.setNow('2026-06-01T11:20:00Z');
      expect(await p.preStart.evaluate(ctx(99))).toMatchObject({
        decision: 'confirm',
        confirmation: { stepKey: expect.stringMatching(/^reservation-/) },
      });
    });

    it('allows outside the window, for the holder, and when the window is 0', async () => {
      h.setNow('2026-06-01T10:30:00Z');
      expect(await p.preStart.evaluate(ctx(10))).toEqual({ decision: 'allow' });
      h.setNow('2026-06-01T11:20:00Z');
      expect(await p.preStart.evaluate(ctx(11))).toEqual({ decision: 'allow' });
      await h.settings.update(1, { confirmWindowMinutes: 0 });
      expect(await p.preStart.evaluate(ctx(10))).toEqual({ decision: 'allow' });
    });

    it('does not run any permission check for a mere confirmation', async () => {
      h.setNow('2026-06-01T11:20:00Z');
      const isManager = jest.spyOn(h.access, 'isManager');
      await p.preStart.evaluate(ctx(10));
      expect(isManager).not.toHaveBeenCalled();
    });
  });

  describe('several bookings of other users', () => {
    const insert = (userId: number, start: string, end: string) =>
      h.dataSource.getRepository(ReservationEntity).save(
        Object.assign(new ReservationEntity(), {
          resourceId: 1,
          userId,
          startTime: new Date(`${start}Z`),
          endTime: new Date(`${end}Z`),
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          status: 'confirmed',
          createdAt: h.clock(),
        }),
      );

    it('asks about each upcoming booking in the window in turn', async () => {
      const a = await p.book(11, 1, '2026-06-01T11:30:00', '2026-06-01T11:45:00');
      const b = await p.book(12, 1, '2026-06-01T12:00:00', '2026-06-01T13:00:00');
      h.setNow('2026-06-01T11:10:00Z');
      expect(await p.preStart.evaluate(ctx(10))).toMatchObject({
        decision: 'confirm',
        confirmation: { stepKey: reservationStepKey(a.id), body: expect.stringContaining('from 13:30') },
      });
      expect(await p.preStart.evaluate(ctx(10, { confirmedStepKeys: [reservationStepKey(a.id)] }))).toMatchObject({
        decision: 'confirm',
        confirmation: { stepKey: reservationStepKey(b.id), body: expect.stringContaining('from 14:00') },
      });
      const both = [reservationStepKey(a.id), reservationStepKey(b.id)];
      expect(await p.preStart.evaluate(ctx(10, { confirmedStepKeys: both }))).toEqual({ decision: 'allow' });
    });

    it('asks a manager about every running booking, then about the next upcoming one', async () => {
      const first = await insert(11, '2026-06-01T12:00:00', '2026-06-01T13:00:00');
      const second = await insert(12, '2026-06-01T12:10:00', '2026-06-01T12:45:00');
      const next = await p.book(13, 1, '2026-06-01T13:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T12:30:00Z');
      const keys: string[] = [];
      const asked: string[] = [];
      for (;;) {
        const result = await p.preStart.evaluate(ctx(99, { confirmedStepKeys: keys }));
        if (result.decision !== 'confirm') {
          expect(result).toEqual({ decision: 'allow' });
          break;
        }
        asked.push(result.confirmation.stepKey);
        keys.push(result.confirmation.stepKey);
      }
      expect(asked).toEqual([overrideStepKey(first.id), overrideStepKey(second.id), reservationStepKey(next.id)]);
      // non-managers stay blocked whatever they send
      expect(await p.preStart.evaluate(ctx(10, { confirmedStepKeys: keys }))).toMatchObject({ decision: 'block' });
    });
  });

  describe.each(['pending', 'cancelled', 'no_show', 'expired', 'rejected'] as const)('%s bookings', (status) => {
    it('never block and never ask', async () => {
      const booking = await p.book(11, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      await h.dataSource.getRepository(ReservationEntity).update({ id: booking.id }, { status });
      h.setNow('2026-06-01T11:30:00Z');
      expect(await p.preStart.evaluate(ctx(10))).toEqual({ decision: 'allow' });
      h.setNow('2026-06-01T12:30:00Z');
      expect(await p.preStart.evaluate(ctx(10))).toEqual({ decision: 'allow' });
    });
  });

  it('frees the slot of an early-ended booking at once', async () => {
    const booking = await p.book(11, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
    h.setNow('2026-06-01T12:30:00Z');
    await h.reservations.endEarly({ userId: 11, authenticationMethod: 'session' }, booking.id);
    expect(await p.preStart.evaluate(ctx(10))).toEqual({ decision: 'allow' });
  });

  it('ignores bookings of other resources', async () => {
    await h.enable(2);
    await p.book(11, 2, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
    h.setNow('2026-06-01T12:30:00Z');
    expect(await p.preStart.evaluate(ctx(10))).toEqual({ decision: 'allow' });
  });

  describe('start-blocked query (resource UI)', () => {
    const query = (userId: number, patch: Partial<StartBlockedContext> = {}): Promise<StartBlockedState | null> =>
      p.preStart.evaluateStartBlocked({
        resourceId: 1,
        userId,
        principal: userId,
        language: 'en',
        now: h.clock(),
        ...patch,
      });

    it('reports a running booking of another user with the same reason as the gate, and when it ends', async () => {
      await p.book(11, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T12:30:00Z');
      const blocked = await query(10);
      const gate = await p.preStart.evaluate(ctx(10));
      expect(gate).toMatchObject({ decision: 'block', reason: blocked?.reason });
      expect(blocked).toEqual({
        reason: { code: 'RESERVED', title: 'Reserved', body: 'Reserved by another user until 16:00.' },
        until: new Date('2026-06-01T14:00:00Z'),
      });
      expect(JSON.stringify(blocked)).not.toContain('user11');
    });

    it('applies the viewer’s API-token scope to the name and to the manager exception', async () => {
      await p.book(11, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T12:30:00Z');
      h.grant(50, 'resources.update');
      h.allowAttribution(50, 1);
      // A session (full permissions) is a manager: nothing to show.
      expect(await query(50)).toBeNull();
      const narrow = await query(50, { principal: { id: 50, effectivePermissions: ['resources.maintenance.manage'] } });
      expect(narrow?.reason.body).toBe('Reserved by another user until 16:00.');
    });

    it("names the holder exactly when the gate does: viewers who may see the machine's current user", async () => {
      await p.book(11, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T12:30:00Z');
      h.allowAttribution(10, 1);
      const named = await query(10);
      expect(named?.reason.body).toBe('Reserved by user11 until 16:00.');
      expect(await p.preStart.evaluate(ctx(10))).toMatchObject({ reason: named?.reason });
      expect((await query(10, { language: 'de' }))?.reason.body).toBe('Von user11 bis 16:00 reserviert.');
      const anonymous = await query(12);
      expect(anonymous?.reason.body).toBe('Reserved by another user until 16:00.');
      expect(JSON.stringify(anonymous)).not.toContain('user11');
    });

    it('stays silent on a hidden resource even for a viewer with attribution access', async () => {
      await p.book(11, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T12:30:00Z');
      h.allowAttribution(10, 1);
      h.state.hidden.add(1);
      expect(await query(10)).toBeNull();
    });

    it('writes the reason in the requested language', async () => {
      await p.book(11, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T12:30:00Z');
      expect((await query(10, { language: 'de' }))?.reason.body).toBe('Von einer anderen Person bis 16:00 reserviert.');
    });

    it('is empty for the holder, for managers, before the start and after the end', async () => {
      await p.book(11, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      expect(await query(10)).toBeNull();
      h.setNow('2026-06-01T12:30:00Z');
      expect(await query(11)).toBeNull();
      expect(await query(99)).toBeNull();
      h.setNow('2026-06-01T14:00:00Z');
      expect(await query(10)).toBeNull();
    });

    it('does not report a booking that only starts later, a cancelled one, or another resource', async () => {
      h.setNow('2026-06-01T12:30:00Z');
      await p.book(11, 1, '2026-06-01T12:45:00', '2026-06-01T14:00:00');
      expect(await query(10)).toBeNull();
      h.setNow('2026-06-01T13:15:00Z');
      expect(await query(10)).not.toBeNull();
      await h.dataSource.getRepository(ReservationEntity).update({ userId: 11 }, { status: 'cancelled' });
      expect(await query(10)).toBeNull();
      expect(await query(10, { resourceId: 2 })).toBeNull();
    });

    it('says nothing about a resource the viewer may not see, and checks visibility only for a running booking', async () => {
      const filterVisible = jest.spyOn(h.visibility, 'filterVisible');
      expect(await query(10)).toBeNull();
      expect(filterVisible).not.toHaveBeenCalled();
      await p.book(11, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T12:30:00Z');
      expect(await query(10)).not.toBeNull();
      h.state.hidden.add(1);
      expect(await query(10)).toBeNull();
      expect(filterVisible).toHaveBeenLastCalledWith(10, [1]);
    });

    it('answers a disabled resource from memory without a database query', async () => {
      const find = jest.spyOn(h.store, 'findActiveForResource');
      expect(await query(10, { resourceId: 2 })).toBeNull();
      expect(find).not.toHaveBeenCalled();
    });
  });
});
