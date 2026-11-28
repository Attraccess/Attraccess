import { Harness, createHarness, principal } from '../testing/harness.test-utils';

/**
 * Machine list visibility (ATT-1407): a machine the host hides from a user is not told to them by any reservation
 * query or action, whatever they manage. Their own bookings on it stay theirs.
 */
describe('reservations on a machine hidden from the user', () => {
  let h: Harness;
  const HOLDER = 10;
  const OTHER = 11;
  /** Manages machines 1 and 2 by role. */
  const ROLE_MANAGER = 99;
  /** Holds resources.update. */
  const UPDATER = 98;
  const range = [new Date('2026-06-01T00:00:00Z'), new Date('2026-06-08T00:00:00Z')] as const;

  const book = (userId: number, resourceId: number, day: string) =>
    h.reservations.create(principal(userId), {
      resourceId,
      startTime: new Date(`2026-06-${day}T08:00:00Z`),
      endTime: new Date(`2026-06-${day}T09:00:00Z`),
    });
  const notFound = (code: 'RESOURCE_NOT_FOUND' | 'RESERVATION_NOT_FOUND') =>
    expect.objectContaining({ status: 404, response: expect.objectContaining({ code }) });

  beforeEach(async () => {
    h = await createHarness();
    for (const id of [1, 2]) {
      await h.enable(id, { approvalRequired: true });
      h.makeManager(ROLE_MANAGER, id);
    }
    h.grant(UPDATER, 'resources.update');
  });
  afterEach(() => h.close());

  it('keeps the holder’s own booking: mine, detail and cancel, with the machine name', async () => {
    const booking = await book(HOLDER, 1, '02');
    h.hideFrom(HOLDER, 1);

    expect(await h.queries.listMine(principal(HOLDER), 'upcoming')).toEqual([
      expect.objectContaining({ id: booking.id, resourceName: 'Resource 1' }),
    ]);
    expect(await h.queries.get(principal(HOLDER), booking.id)).toMatchObject({ resourceName: 'Resource 1' });
    expect((await h.reservations.keep(principal(HOLDER), booking.id)).id).toBe(booking.id);
    expect((await h.reservations.cancel(principal(HOLDER), booking.id)).status).toBe('cancelled');
  });

  it('tells the holder nothing else about the machine', async () => {
    await book(HOLDER, 1, '02');
    await book(OTHER, 1, '03');
    h.hideFrom(HOLDER, 1);

    await expect(h.queries.availability(principal(HOLDER), 1, ...range)).rejects.toEqual(
      notFound('RESOURCE_NOT_FOUND'),
    );
    await expect(book(HOLDER, 1, '04')).rejects.toEqual(notFound('RESOURCE_NOT_FOUND'));
  });

  it('does not let a manager role show another person’s booking or decide on it', async () => {
    const booking = await book(OTHER, 1, '02');
    h.hideFrom(ROLE_MANAGER, 1);
    const actor = principal(ROLE_MANAGER);

    for (const attempt of [
      () => h.queries.get(actor, booking.id),
      () => h.reservations.cancel(actor, booking.id, 'no'),
      () => h.reservations.endEarly(actor, booking.id),
      () => h.reservations.approve(actor, booking.id),
      () => h.reservations.reject(actor, booking.id),
    ]) {
      await expect(attempt()).rejects.toEqual(notFound('RESERVATION_NOT_FOUND'));
    }
    expect((await h.reservation(booking.id)).status).toBe('pending');
  });

  it('lets the holder of a hidden machine neither approve their own booking through a manager role', async () => {
    const booking = await book(ROLE_MANAGER, 1, '02');
    h.hideFrom(ROLE_MANAGER, 1);
    await expect(h.reservations.approve(principal(ROLE_MANAGER), booking.id)).rejects.toMatchObject({ status: 403 });
    // The lists must not offer the decision either.
    expect(await h.queries.listMine(principal(ROLE_MANAGER), 'upcoming')).toEqual([
      expect.objectContaining({ id: booking.id, canDecide: false }),
    ]);
  });

  it('leaves hidden machines out of the manager list and its total', async () => {
    await book(OTHER, 1, '02');
    const shown = await book(OTHER, 2, '03');
    h.hideFrom(ROLE_MANAGER, 1);

    const list = await h.queries.listManaged(principal(ROLE_MANAGER), { page: 1 });
    expect(list.items.map((item) => item.id)).toEqual([shown.id]);
    expect(list.total).toBe(1);
  });

  it('answers the machine filter for a hidden machine like an unknown one, also to a non-manager', async () => {
    h.hideFrom(ROLE_MANAGER, 1);
    h.hideFrom(OTHER, 1);
    for (const [userId, resourceId] of [
      [ROLE_MANAGER, 1],
      [ROLE_MANAGER, 404],
      [OTHER, 1],
    ]) {
      await expect(h.queries.listManaged(principal(userId), { page: 1, resourceId })).rejects.toEqual(
        notFound('RESOURCE_NOT_FOUND'),
      );
    }
    // A visible machine the caller does not manage stays a 403.
    await expect(h.queries.listManaged(principal(OTHER), { page: 1, resourceId: 2 })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('is no manager at all when every managed machine is hidden', async () => {
    h.hideFrom(ROLE_MANAGER, 1);
    h.hideFrom(ROLE_MANAGER, 2);
    expect(await h.queries.managerAccess(principal(ROLE_MANAGER))).toEqual({ isManager: false });
    await expect(h.queries.listManaged(principal(ROLE_MANAGER), { page: 1 })).rejects.toMatchObject({ status: 403 });
  });

  it('changes nothing for resources.update holders, who also keep the bookings of a deleted machine', async () => {
    const booking = await book(OTHER, 1, '02');
    h.deleteResource(1);
    const actor = principal(UPDATER);

    expect((await h.queries.listManaged(actor, { page: 1 })).total).toBe(1);
    expect((await h.queries.listManaged(actor, { page: 1, resourceId: 1 })).total).toBe(1);
    expect(await h.queries.get(actor, booking.id)).toMatchObject({ id: booking.id });
    expect((await h.reservations.approve(actor, booking.id)).status).toBe('confirmed');
  });
});
