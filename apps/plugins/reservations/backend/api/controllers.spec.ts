import { DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { ReservationQueryService } from '../reservations/reservation-query.service';
import { Harness, createHarness } from '../testing/harness.test-utils';
import { CreateReservationBody, UpdateGlobalSettingsBody } from './dto.request';
import { validated } from './pipes';
import { ReservationsController } from './reservations.controller';
import { ReservationSettingsController } from './settings.controller';

const request = (userId: number) => ({ user: { id: userId, authenticationMethod: 'session' } }) as never;

describe('controllers', () => {
  let h: Harness;
  let reservations: ReservationsController;
  let settings: ReservationSettingsController;

  beforeEach(async () => {
    h = await createHarness();
    h.makeManager(99, 1);
    await h.enable(1);
    reservations = new ReservationsController(h.reservations, h.queries as ReservationQueryService);
    settings = new ReservationSettingsController(h.admin, h.access, h.directory);
  });
  afterEach(() => h.close());

  it('guards every route with session + API-token auth', () => {
    for (const controller of [ReservationsController, ReservationSettingsController]) {
      const guards = Reflect.getMetadata('__guards__', controller) as unknown[];
      expect(guards).toEqual(expect.arrayContaining([DualAuthGuard, EffectivePermissionsGuard]));
    }
    const putGlobal = ReservationSettingsController.prototype.updateGlobal;
    expect(Reflect.getMetadata('__guards__', putGlobal)).toEqual(expect.arrayContaining([DualAuthGuard]));
  });

  it('creates from duration, and never leaks the holder to others', async () => {
    const created = await reservations.create(
      { resourceId: 1, startTime: '2026-06-02T08:00:00Z', durationMinutes: 60, note: 'x' },
      request(10),
    );
    expect(created).toMatchObject({ endTime: '2026-06-02T09:00:00.000Z', mine: true, userName: 'user10' });
    const seen = await reservations.availability(1, '2026-06-01T00:00:00Z', '2026-06-08T00:00:00Z', request(11));
    expect(seen.reservations[0]).toMatchObject({ userName: null, userId: null });
    await expect(reservations.get(created.id, request(11))).rejects.toMatchObject({ status: 404 });
  });

  it('answers conflicts with 409 and a typed body', async () => {
    const body = { resourceId: 1, startTime: '2026-06-02T08:00:00Z', durationMinutes: 60 };
    await reservations.create(body, request(10));
    const error = await reservations.create(body, request(11)).catch((e) => e);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({ code: 'OVERLAP', message: expect.any(String) });
  });

  it('requires endTime or durationMinutes', async () => {
    await expect(
      reservations.create({ resourceId: 1, startTime: '2026-06-02T08:00:00Z' }, request(10)),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('supports the whole lifecycle through the API', async () => {
    h.state.canStart.clear();
    const created = await reservations.create(
      { resourceId: 1, startTime: '2026-06-02T08:00:00Z', durationMinutes: 120 },
      request(10),
    );
    expect((await reservations.listMine(request(10))).map((r) => r.id)).toEqual([created.id]);
    expect(await reservations.keep(created.id, request(10))).toMatchObject({ id: created.id });
    h.setNow('2026-06-02T08:30:00Z');
    expect(await reservations.endEarly(created.id, request(10))).toMatchObject({ status: 'completed' });
    expect((await reservations.listManaged(request(99))).items).toHaveLength(1);
  });

  it('cancels, approves and rejects through the API', async () => {
    await h.enable(1, { approvalRequired: true });
    const a = await reservations.create(
      { resourceId: 1, startTime: '2026-06-02T08:00:00Z', durationMinutes: 60 },
      request(10),
    );
    const b = await reservations.create(
      { resourceId: 1, startTime: '2026-06-02T10:00:00Z', durationMinutes: 60 },
      request(10),
    );
    expect((await reservations.approve(a.id, { reason: 'fine' }, request(99))).status).toBe('confirmed');
    expect((await reservations.reject(b.id, undefined, request(99))).status).toBe('rejected');
    expect((await reservations.cancel(a.id, { reason: 'bye' }, request(10))).status).toBe('cancelled');
  });

  it('rejects bad query values', () => {
    expect(() => reservations.listMine(request(10), 'sometime')).toThrow(/scope/);
    expect(() => reservations.listMine(request(10), 'upcoming', 'bogus')).toThrow(/status/);
    expect(() => reservations.availability(1, undefined, undefined, request(10))).toThrow(/required/);
  });

  it('restricts settings to managers (403 elsewhere)', async () => {
    await expect(settings.getSettings(1, request(10))).rejects.toMatchObject({ status: 403 });
    await expect(settings.updateSettings(1, { enabled: true }, request(10))).rejects.toMatchObject({ status: 403 });
    await expect(settings.futureBookingsCount(1, request(10))).rejects.toMatchObject({ status: 403 });
    expect(await settings.getSettings(1, request(99))).toMatchObject({ resourceId: 1, enabled: true });
    expect(await settings.managerAccess(1, request(10))).toEqual({ isManager: false });
    expect(await settings.managerAccess(1, request(99))).toEqual({ isManager: true });
    const updated = await settings.updateSettings(1, { maxDurationMinutes: 120 }, request(99));
    expect(updated).toMatchObject({ cancelledBookings: 0, settings: { maxDurationMinutes: 120 } });
  });

  it('exposes the global settings', async () => {
    expect(await settings.getGlobal()).toMatchObject({ timezone: 'Europe/Berlin' });
    expect(await settings.updateGlobal({ timezone: 'UTC' }, request(1))).toMatchObject({ timezone: 'UTC' });
    await expect(settings.updateGlobal({ timezone: 'bad' }, request(1))).rejects.toMatchObject({ status: 400 });
    expect(Reflect.getMetadata('__guards__', ReservationSettingsController.prototype.updateGlobal)).toBeDefined();
  });

  describe('validation pipes', () => {
    const run = (pipe: ReturnType<typeof validated>, value: unknown) =>
      pipe.transform(value, { type: 'body', metatype: Object });

    it('rejects malformed bodies and strips unknown fields', async () => {
      const pipe = validated(CreateReservationBody);
      await expect(run(pipe, { resourceId: 'x', startTime: 'nope' })).rejects.toMatchObject({ status: 400 });
      await expect(
        run(pipe, { resourceId: 1, startTime: '2026-06-02T08:00:00Z', durationMinutes: 0 }),
      ).rejects.toMatchObject({ status: 400 });
      const ok = (await run(pipe, {
        resourceId: 1,
        startTime: '2026-06-02T08:00:00Z',
        durationMinutes: 30,
        evil: 1,
      })) as Record<string, unknown>;
      expect(ok).toMatchObject({ resourceId: 1, durationMinutes: 30 });
      expect(ok).not.toHaveProperty('evil');
      await expect(run(validated(UpdateGlobalSettingsBody), {})).rejects.toMatchObject({ status: 400 });
    });
  });
});
