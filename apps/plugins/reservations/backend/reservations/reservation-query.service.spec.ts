import { ReservationError } from './errors';
import { Harness, at, createHarness, principal } from '../testing/harness.test-utils';

const slot = (startHour: number, endHour: number, day = '2026-06-02') => ({
  startTime: at(`${day}T${String(startHour).padStart(2, '0')}:00:00`),
  endTime: at(`${day}T${String(endHour).padStart(2, '0')}:00:00`),
});

describe('ReservationQueryService', () => {
  let h: Harness;
  const alice = principal(10);
  const bob = principal(11);
  const manager = principal(99);
  const range = [at('2026-06-01T00:00:00'), at('2026-06-08T00:00:00')] as const;

  beforeEach(async () => {
    h = await createHarness();
    h.makeManager(99, 1);
    await h.enable(1, { approvalRequired: false });
  });
  afterEach(() => h.close());

  it('redacts holder identity and note for everyone but the holder and managers', async () => {
    await h.reservations.create(alice, { resourceId: 1, ...slot(8, 9), note: 'secret project' });
    const forBob = await h.queries.availability(bob, 1, ...range);
    expect(forBob.reservations).toHaveLength(1);
    expect(forBob.reservations[0]).toMatchObject({
      mine: false,
      userId: null,
      userName: null,
      note: null,
      createdAt: null,
      cancelReason: null,
      checkedInAt: null,
      canCancel: false,
      canEndEarly: false,
      canKeep: false,
      canDecide: false,
      startTime: '2026-06-02T08:00:00.000Z',
    });
    expect(JSON.stringify(forBob)).not.toContain('user10');
    expect(JSON.stringify(forBob)).not.toContain('secret project');

    const forAlice = await h.queries.availability(alice, 1, ...range);
    expect(forAlice.reservations[0]).toMatchObject({
      mine: true,
      userId: 10,
      userName: 'user10',
      note: 'secret project',
      canCancel: true,
      canKeep: true,
    });

    const forManager = await h.queries.availability(manager, 1, ...range);
    expect(forManager.isManager).toBe(true);
    expect(forManager.reservations[0]).toMatchObject({
      mine: false,
      userId: 10,
      userName: 'user10',
      note: 'secret project',
      canCancel: true,
    });
  });

  it('returns rules, timezone and canBook for the caller', async () => {
    await h.enable(1, {
      whoCanBook: 'managers-only',
      bufferAfterMinutes: 15,
      timeStepMinutes: 30,
      minDurationMinutes: 30,
    });
    const forBob = await h.queries.availability(bob, 1, ...range);
    expect(forBob).toMatchObject({
      enabled: true,
      timezone: 'Europe/Berlin',
      isManager: false,
      canBook: { allowed: false, reason: 'NOT_ALLOWED_TO_BOOK' },
      rules: { timeStepMinutes: 30, bufferAfterMinutes: 15, whoCanBook: 'managers-only' },
    });
    expect((await h.queries.availability(manager, 1, ...range)).canBook).toEqual({ allowed: true, reason: null });
    expect(forBob.rules).not.toHaveProperty('confirmWindowMinutes');
  });

  it('returns no bookings for disabled resources and lists maintenance windows', async () => {
    await h.admin.update(manager, 1, { enabled: false });
    const disabled = await h.queries.availability(bob, 1, ...range);
    expect(disabled).toMatchObject({
      enabled: false,
      reservations: [],
      canBook: { allowed: false, reason: 'RESERVATIONS_DISABLED' },
    });
    await h.enable(1);
    h.state.maintenance.push({
      maintenanceId: 1,
      resourceId: 1,
      startTime: at('2026-06-03T08:00:00'),
      endTime: null,
      reason: null,
    });
    expect((await h.queries.availability(bob, 1, ...range)).maintenance).toEqual([
      { startTime: '2026-06-03T08:00:00.000Z', endTime: null },
    ]);
  });

  it('validates ranges and resources', async () => {
    await expect(h.queries.availability(bob, 1, range[1], range[0])).rejects.toMatchObject({ code: 'INVALID_RANGE' });
    await expect(h.queries.availability(bob, 1, range[0], at('2026-09-01T00:00:00'))).rejects.toMatchObject({
      code: 'RANGE_TOO_LARGE',
    });
    await expect(h.queries.availability(bob, 55, ...range)).rejects.toBeInstanceOf(ReservationError);
  });

  it('lists my bookings by scope and status', async () => {
    const upcoming = await h.reservations.create(alice, { resourceId: 1, ...slot(8, 9) });
    const cancelled = await h.reservations.create(alice, { resourceId: 1, ...slot(10, 11) });
    await h.reservations.cancel(alice, cancelled.id);
    await h.reservations.create(bob, { resourceId: 1, ...slot(12, 13) });
    expect((await h.queries.listMine(alice, 'upcoming')).map((r) => r.id)).toEqual([upcoming.id]);
    expect((await h.queries.listMine(alice, 'past')).map((r) => r.id)).toEqual([cancelled.id]);
    expect(await h.queries.listMine(alice, 'past', 'completed')).toEqual([]);
    h.setNow('2026-06-03T00:00:00Z');
    expect(await h.queries.listMine(alice, 'upcoming')).toEqual([]);
    expect((await h.queries.listMine(alice, 'past')).map((r) => r.id).sort()).toEqual(
      [upcoming.id, cancelled.id].sort(),
    );
  });

  it('gets a booking for holder and manager only', async () => {
    const r = await h.reservations.create(alice, { resourceId: 1, ...slot(8, 9) });
    expect(await h.queries.get(alice, r.id)).toMatchObject({ id: r.id, userName: 'user10' });
    expect(await h.queries.get(manager, r.id)).toMatchObject({ id: r.id, userName: 'user10' });
    await expect(h.queries.get(bob, r.id)).rejects.toMatchObject({ code: 'RESERVATION_NOT_FOUND' });
  });

  it('lists managed bookings only for managed resources (resources.update sees all)', async () => {
    await h.enable(2);
    await h.reservations.create(alice, { resourceId: 1, ...slot(8, 9) });
    await h.reservations.create(alice, { resourceId: 2, ...slot(8, 9) });
    const asManager = await h.queries.listManaged(manager, { page: 1 });
    expect(asManager).toMatchObject({ total: 1, page: 1, pageSize: 25 });
    expect(asManager.items[0]).toMatchObject({ resourceId: 1, userName: 'user10' });
    await expect(h.queries.listManaged(manager, { page: 1, resourceId: 2 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    // Someone who manages nothing is refused (the frontend probes this to decide whether to show the manager pages).
    await expect(h.queries.listManaged(bob, { page: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    h.grant(50, 'resources.update');
    expect((await h.queries.listManaged(principal(50), { page: 1 })).total).toBe(2);
    expect((await h.queries.listManaged(principal(50), { page: 1, resourceId: 2, status: 'confirmed' })).total).toBe(1);
    expect((await h.queries.listManaged(principal(50), { page: 1, status: 'cancelled' })).total).toBe(0);
  });
});
