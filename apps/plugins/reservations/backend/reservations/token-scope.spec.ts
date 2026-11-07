import { UnauthorizedException } from '@nestjs/common';
import { ReservationSettingsController } from '../api/settings.controller';
import { principalOf } from '../api/support';
import { Harness, at, createHarness, principal, tokenActor } from '../testing/harness.test-utils';
import { ReservationError } from './errors';

// API-token requests act with the token's scope (core narrows request.user.effectivePermissions to it). Every
// request-path manager check must apply that scope; maintainer/introducer roles are not permissions and still count.
const slot = (startHour: number, endHour: number) => ({
  startTime: at(`2026-06-02T${String(startHour).padStart(2, '0')}:00:00`),
  endTime: at(`2026-06-02T${String(endHour).padStart(2, '0')}:00:00`),
});
const range = [at('2026-06-02T00:00:00'), at('2026-06-03T00:00:00')] as const;

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ReservationError) return error.code;
    throw error;
  }
  return 'NO_ERROR';
}

describe('API-token scope', () => {
  let h: Harness;
  const alice = principal(10);
  const admin = principal(20); // holds resources.update through a role
  const narrowAdmin = tokenActor(20, ['resources.read']);
  const fullAdmin = tokenActor(20, ['resources.read', 'resources.update']);
  const narrowMaintainer = tokenActor(21, ['resources.read']); // introducer/maintainer of resource 1

  beforeEach(async () => {
    h = await createHarness();
    h.grant(20, 'resources.update');
    h.makeManager(21, 1);
  });
  afterEach(() => h.close());

  it('a token without resources.update cannot manage others’ bookings although its owner can', async () => {
    await h.enable(1, { approvalRequired: true });
    const pending = await h.reservations.create(alice, { resourceId: 1, ...slot(8, 9) });

    expect(await codeOf(h.reservations.approve(narrowAdmin, pending.id))).toBe('RESERVATION_NOT_FOUND');
    expect(await codeOf(h.reservations.reject(narrowAdmin, pending.id))).toBe('RESERVATION_NOT_FOUND');
    expect(await codeOf(h.reservations.cancel(narrowAdmin, pending.id, 'nope'))).toBe('RESERVATION_NOT_FOUND');
    expect(await codeOf(h.queries.get(narrowAdmin, pending.id))).toBe('RESERVATION_NOT_FOUND');
    expect(await codeOf(h.queries.listManaged(narrowAdmin, { page: 1 }))).toBe('FORBIDDEN');
    expect(await h.queries.managerAccess(narrowAdmin)).toEqual({ isManager: false });
    expect((await h.store.findById(pending.id))?.status).toBe('pending');

    // Holder details stay hidden from the token.
    const view = await h.queries.availability(narrowAdmin, 1, ...range);
    expect(view.isManager).toBe(false);
    expect(view.reservations).toEqual([expect.objectContaining({ id: pending.id, userId: null, userName: null })]);

    // The owner's session and a token carrying resources.update are unaffected.
    expect((await h.queries.listManaged(admin, { page: 1 })).total).toBe(1);
    expect((await h.queries.listManaged(fullAdmin, { page: 1 })).total).toBe(1);
    expect((await h.reservations.approve(fullAdmin, pending.id)).status).toBe('confirmed');
  });

  it('a token without resources.update cannot read or change resource settings', async () => {
    await h.enable(1);
    expect(await codeOf(h.admin.getForManager(narrowAdmin, 1))).toBe('FORBIDDEN');
    expect(await codeOf(h.admin.futureBookingsCount(narrowAdmin, 1))).toBe('FORBIDDEN');
    expect(await codeOf(h.admin.update(narrowAdmin, 1, { maxDurationMinutes: 60 }))).toBe('FORBIDDEN');
    expect((await h.settings.get(1)).maxDurationMinutes).toBe(240);

    expect((await h.admin.getForManager(admin, 1)).enabled).toBe(true);
    await h.admin.update(fullAdmin, 1, { maxDurationMinutes: 60 });
    expect((await h.settings.get(1)).maxDurationMinutes).toBe(60);
  });

  it('a token without resources.update cannot end others’ bookings early', async () => {
    await h.enable(1);
    const booking = await h.reservations.create(alice, { resourceId: 1, ...slot(8, 9) });
    h.setNow('2026-06-02T08:30:00Z');
    expect(await codeOf(h.reservations.endEarly(narrowAdmin, booking.id))).toBe('RESERVATION_NOT_FOUND');
    expect((await h.reservations.endEarly(admin, booking.id)).status).toBe('completed');
  });

  it('managers-only booking needs the permission on the token', async () => {
    await h.enable(1, { whoCanBook: 'managers-only' });
    const view = await h.queries.availability(narrowAdmin, 1, ...range);
    expect(view.canBook).toEqual({ allowed: false, reason: 'NOT_ALLOWED_TO_BOOK' });
    expect(await codeOf(h.reservations.create(narrowAdmin, { resourceId: 1, ...slot(8, 9) }))).toBe(
      'NOT_ALLOWED_TO_BOOK',
    );
    expect((await h.queries.availability(admin, 1, ...range)).canBook.allowed).toBe(true);
    expect((await h.reservations.create(fullAdmin, { resourceId: 1, ...slot(8, 9) })).status).toBe('confirmed');
  });

  it('the token scope cannot exceed what the owner currently holds', async () => {
    await h.enable(1, { approvalRequired: true });
    const pending = await h.reservations.create(alice, { resourceId: 1, ...slot(8, 9) });
    const stale = tokenActor(30, ['resources.update']); // user 30 does not hold resources.update
    expect(await codeOf(h.reservations.approve(stale, pending.id))).toBe('RESERVATION_NOT_FOUND');
  });

  it('a token without resources.maintenance.manage does not inherit the owner’s maintenance rights', async () => {
    await h.enable(1, { approvalRequired: true });
    h.grant(40, 'resources.maintenance.manage');
    const pending = await h.reservations.create(alice, { resourceId: 1, ...slot(8, 9) });
    expect(await codeOf(h.reservations.approve(tokenActor(40, ['resources.read']), pending.id))).toBe(
      'RESERVATION_NOT_FOUND',
    );
    expect((await h.reservations.approve(principal(40), pending.id)).status).toBe('confirmed');
  });

  it('maintainer/introducer rights still apply to a narrow token, as in core', async () => {
    await h.enable(1, { approvalRequired: true, whoCanBook: 'managers-only' });
    const pending = await h.reservations.create(alice, { resourceId: 1, ...slot(8, 9) }).catch(() => null);
    expect(pending).toBeNull(); // alice may not book on a managers-only resource
    await h.settings.update(1, { whoCanBook: 'any-user' });
    const booking = await h.reservations.create(alice, { resourceId: 1, ...slot(8, 9) });
    await h.settings.update(1, { whoCanBook: 'managers-only' });

    expect((await h.queries.availability(narrowMaintainer, 1, ...range)).canBook.allowed).toBe(true);
    expect((await h.queries.listManaged(narrowMaintainer, { page: 1 })).total).toBe(1);
    expect((await h.admin.getForManager(narrowMaintainer, 1)).enabled).toBe(true);
    expect((await h.reservations.approve(narrowMaintainer, booking.id)).status).toBe('confirmed');
    // The audit entry names the token, never the permissions the actor carried.
    expect(h.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reservations.approved',
        principal: { userId: 21, authenticationMethod: 'api-token', apiTokenId: 1 },
      }),
    );
  });

  describe('principalOf', () => {
    it('carries the request scope into the actor', () => {
      const actor = principalOf({
        user: {
          id: 20,
          authenticationMethod: 'api-token',
          apiTokenId: 7,
          effectivePermissions: new Set(['resources.read']),
        },
      } as never);
      expect(actor).toEqual(tokenActor(20, ['resources.read'], 7));
    });

    it('refuses an API-token request without a scope instead of using the owner’s full permissions', () => {
      expect(() =>
        principalOf({ user: { id: 20, authenticationMethod: 'api-token', apiTokenId: 7 } } as never),
      ).toThrow(UnauthorizedException);
    });

    it('applies the scope end to end through a controller', async () => {
      await h.enable(1);
      const controller = new ReservationSettingsController(h.admin, h.access, h.directory);
      const request = (scope: string[]) =>
        ({
          user: { id: 20, authenticationMethod: 'api-token', apiTokenId: 7, effectivePermissions: new Set(scope) },
        }) as never;
      expect(await controller.managerAccess(1, request(['resources.read']))).toEqual({ isManager: false });
      expect(await codeOf(controller.getSettings(1, request(['resources.read'])))).toBe('FORBIDDEN');
      expect(await controller.managerAccess(1, request(['resources.update']))).toEqual({ isManager: true });
    });
  });
});
