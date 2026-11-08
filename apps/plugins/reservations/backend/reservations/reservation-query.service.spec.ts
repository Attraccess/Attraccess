import { ReservationError } from './errors';
import { Harness, at, createHarness, principal, tokenActor } from '../testing/harness.test-utils';

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

  it("names the holder, but nothing else, for viewers who may see the machine's current user", async () => {
    await h.reservations.create(alice, { resourceId: 1, ...slot(8, 9), note: 'secret project' });
    h.allowAttribution(bob.userId, 1);
    const [seen] = (await h.queries.availability(bob, 1, ...range)).reservations;
    expect(seen).toMatchObject({
      mine: false,
      userName: 'user10',
      userId: null,
      createdAt: null,
      note: null,
      cancelReason: null,
      canCancel: false,
    });
    // A viewer without that access gets no name.
    const carol = principal(12);
    expect((await h.queries.availability(carol, 1, ...range)).reservations[0].userName).toBeNull();
    // Attribution is per machine: bob gets no name on resource 2, where he may not see the current user.
    await h.enable(2);
    await h.reservations.create(alice, { resourceId: 2, ...slot(8, 9) });
    expect((await h.queries.availability(bob, 2, ...range)).reservations[0].userName).toBeNull();
    h.allowAttribution(carol.userId, 2);
    expect((await h.queries.availability(carol, 2, ...range)).reservations[0].userName).toBe('user10');
    // A token whose scope may not see who uses machines gets no name, whatever the owner may see.
    expect(
      (await h.queries.availability(tokenActor(bob.userId, ['resources.maintenance.manage']), 1, ...range))
        .reservations[0].userName,
    ).toBeNull();
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

  it('answers 404 for resources the caller cannot see, like unknown ones', async () => {
    h.state.hidden.add(1);
    await expect(h.queries.availability(bob, 1, ...range)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    h.state.hidden.delete(1);
    expect((await h.queries.availability(bob, 1, ...range)).enabled).toBe(true);
  });

  it('answers disabled resources from the settings cache without permission lookups', async () => {
    await h.admin.update(manager, 1, { enabled: false });
    const isManager = jest.spyOn(h.access, 'isManager');
    const canBook = jest.spyOn(h.access, 'canBook');
    const read = jest.spyOn(h.settings, 'get');
    expect(await h.queries.availability(manager, 1, ...range)).toMatchObject({
      enabled: false,
      isManager: false,
      canBook: { allowed: false, reason: 'RESERVATIONS_DISABLED' },
    });
    expect(isManager).not.toHaveBeenCalled();
    expect(canBook).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('looks up manager rights once (canBook reuses the resolved flag)', async () => {
    await h.reservations.create(alice, { resourceId: 1, ...slot(8, 9) });
    await h.settings.update(1, { whoCanBook: 'managers-only' });
    const isManager = jest.spyOn(h.access, 'isManager');
    const canBook = jest.spyOn(h.access, 'canBook');
    const managed = jest.spyOn(h.access, 'managedResourceIds');
    expect((await h.queries.availability(manager, 1, ...range)).canBook).toEqual({ allowed: true, reason: null });
    expect((await h.queries.availability(bob, 1, ...range)).canBook).toEqual({
      allowed: false,
      reason: 'NOT_ALLOWED_TO_BOOK',
    });
    expect(isManager).toHaveBeenCalledTimes(2);
    expect(canBook).toHaveBeenCalledWith(manager, 1, expect.anything(), true);
    expect(canBook).toHaveBeenCalledWith(bob, 1, expect.anything(), false);
    expect(managed).not.toHaveBeenCalled();
  });

  it('reports USER_BOOKING_LIMIT in canBook once the caller holds the maximum', async () => {
    await h.enable(1, { maxActiveBookingsPerUser: 2 });
    await h.reservations.create(alice, { resourceId: 1, ...slot(8, 9) });
    expect((await h.queries.availability(alice, 1, ...range)).canBook).toEqual({ allowed: true, reason: null });
    const second = await h.reservations.create(alice, { resourceId: 1, ...slot(10, 11) });
    expect((await h.queries.availability(alice, 1, ...range)).canBook).toEqual({
      allowed: false,
      reason: 'USER_BOOKING_LIMIT',
    });
    expect((await h.queries.availability(bob, 1, ...range)).canBook.allowed).toBe(true);
    await h.reservations.cancel(alice, second.id);
    expect((await h.queries.availability(alice, 1, ...range)).canBook.allowed).toBe(true);
    // 0 = unlimited; the creation path agrees with the advertised limit.
    await h.enable(1, { maxActiveBookingsPerUser: 0 });
    expect((await h.queries.availability(alice, 1, ...range)).canBook.allowed).toBe(true);
    await h.enable(1, { maxActiveBookingsPerUser: 1 });
    await expect(h.reservations.create(alice, { resourceId: 1, ...slot(12, 13) })).rejects.toMatchObject({
      code: 'USER_BOOKING_LIMIT',
    });
  });

  it('includes neighbours whose buffers reach into the range, and maintenance within this resource’s buffers', async () => {
    // A booking 10:00-11:00 created with 60 min buffer after blocks until 12:00.
    await h.enable(1, { bufferAfterMinutes: 60 });
    const neighbour = await h.reservations.create(bob, { resourceId: 1, ...slot(10, 11) });
    await h.enable(1, { bufferBeforeMinutes: 30, bufferAfterMinutes: 0 });
    const day = [at('2026-06-02T11:30:00'), at('2026-06-02T18:00:00')] as const;
    // Its buffered span [10:00, 12:00) overlaps [11:00, 18:00) (the range widened by bufferBefore 30).
    expect((await h.queries.availability(alice, 1, ...day)).reservations.map((r) => r.id)).toEqual([neighbour.id]);
    // A range starting 12:30 widens to 12:00: the neighbour's span ends exactly there and is left out.
    const later = [at('2026-06-02T12:30:00'), at('2026-06-02T18:00:00')] as const;
    expect((await h.queries.availability(alice, 1, ...later)).reservations).toEqual([]);

    h.state.maintenance.push({
      maintenanceId: 1,
      resourceId: 1,
      startTime: at('2026-06-02T09:00:00'),
      endTime: at('2026-06-02T11:15:00'),
      reason: null,
    });
    // Maintenance ending 11:15 is before the range (11:30) but inside its 30 min buffer.
    expect((await h.queries.availability(alice, 1, ...day)).maintenance).toEqual([
      { startTime: '2026-06-02T09:00:00.000Z', endTime: '2026-06-02T11:15:00.000Z' },
    ]);
    expect((await h.queries.availability(alice, 1, ...later)).maintenance).toEqual([]);
  });

  it('presents mixed resources with a single managed-resources lookup', async () => {
    await h.enable(2);
    await h.reservations.create(alice, { resourceId: 1, ...slot(8, 9) });
    await h.reservations.create(alice, { resourceId: 2, ...slot(8, 9) });
    const isManager = jest.spyOn(h.access, 'isManager');
    const managed = jest.spyOn(h.access, 'managedResourceIds');
    const rows = await h.store.listForUser(10, 'upcoming', h.clock());
    const asManager = await h.queries.present(manager, rows);
    expect(asManager.map((r) => [r.resourceId, r.userName]).sort()).toEqual([
      [1, 'user10'],
      [2, null],
    ]);
    expect(managed).toHaveBeenCalledTimes(1);
    expect(isManager).not.toHaveBeenCalled();
    h.grant(50, 'resources.update');
    expect((await h.queries.present(principal(50), rows)).map((r) => r.userName)).toEqual(['user10', 'user10']);
  });

  it('tells whether the caller manages anything', async () => {
    expect(await h.queries.managerAccess(manager)).toEqual({ isManager: true });
    expect(await h.queries.managerAccess(bob)).toEqual({ isManager: false });
    h.grant(50, 'resources.update');
    expect(await h.queries.managerAccess(principal(50))).toEqual({ isManager: true });
    // Core's maintenance permission alone does not make a reservation manager (only maintainer/introducer roles do).
    h.grant(51, 'resources.maintenance.manage');
    expect(await h.queries.managerAccess(principal(51))).toEqual({ isManager: false });
  });
});
