import { DualAuthGuard } from '@attraccess/plugins-backend-sdk';
import { createHash } from 'node:crypto';
import { IcalFeedEntity } from '../entities/ical-feed.entity';
import { ReservationEntity } from '../entities/reservation.entity';
import { ReservationError } from '../reservations/errors';
import { Harness, createHarness, principal } from '../testing/harness.test-utils';
import {
  BackgroundServices as Part2,
  createBackgroundServices as createPart2,
} from '../testing/background-services.test-utils';
import { ICAL_RATE_LIMIT, IcalFeedsController, IcalPublicController } from './ical.controller';
import type { IcalSelectionDto } from './ical.dto';
import { IcalService, hashToken } from './ical.service';
import { RateLimiter } from './rate-limiter';
import { ParsedCalendar, parseIcalDate, validateIcal } from './ical-validator.test-utils';
import type { VisibilityService } from './visibility.service';

const selection = (patch: Partial<IcalSelectionDto> = {}): IcalSelectionDto => ({
  resourceIds: [],
  groupIds: [],
  introduced: false,
  maintained: false,
  ownOnly: false,
  ...patch,
});

describe('IcalService', () => {
  let h: Harness;
  let p: Part2;
  let ical: IcalService;
  const hidden = new Set<number>();
  const groups = new Map<number, number[]>();
  const inactive = new Set<number>();
  const supervisionRequired = new Set<number>();

  const events = (calendar: ParsedCalendar) => calendar.events.map((event) => event.summary).sort();
  const render = async (token: string): Promise<ParsedCalendar> => {
    const source = await ical.renderForToken(token);
    if (source === null) throw new Error('feed not found');
    return validateIcal(source);
  };
  const insert = (patch: Partial<ReservationEntity>) =>
    h.dataSource.getRepository(ReservationEntity).save(
      Object.assign(new ReservationEntity(), {
        resourceId: 1,
        userId: 10,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        status: 'confirmed',
        createdAt: new Date('2026-05-01T00:00:00Z'),
        ...patch,
      }),
    );

  beforeEach(async () => {
    hidden.clear();
    groups.clear();
    inactive.clear();
    supervisionRequired.clear();
    h = await createHarness();
    p = createPart2(h);
    for (const id of [1, 2, 3]) await h.enable(id);
    await h.settings.warmUp();
    const visibility = {
      filterVisible: async (_userId: number, ids: number[]) => ids.filter((id) => !hidden.has(id)),
      resourceIdsOfGroups: async (groupIds: number[]) => groupIds.flatMap((id) => groups.get(id) ?? []),
      isActiveAccount: async (userId: number) => !inactive.has(userId),
      resourceIdsRequiringSupervision: async (ids: number[]) => ids.filter((id) => supervisionRequired.has(id)),
    } as unknown as VisibilityService;
    ical = new IcalService(
      h.context,
      h.store,
      h.settings,
      h.globalSettings,
      h.access,
      h.directory,
      visibility,
      p.hostInfo,
      h.clock,
    );
  });
  afterEach(() => h.close());

  describe('feed management', () => {
    it('returns the secret only once and stores just its sha256', async () => {
      const created = await ical.create(principal(10), { name: ' Work ', selection: selection({ resourceIds: [1] }) });
      expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(created.url).toBe(`https://app.test/api/reservations/ical/${created.token}.ics`);
      expect(created.feed).toMatchObject({ name: 'Work', tokenPrefix: created.token.slice(0, 6) });
      const stored = await h.dataSource.getRepository(IcalFeedEntity).findOneByOrFail({ id: created.feed.id });
      expect(stored.tokenHash).toBe(createHash('sha256').update(created.token).digest('hex'));
      expect(JSON.stringify(stored)).not.toContain(created.token);
      const listed = await ical.list(10);
      expect(JSON.stringify(listed)).not.toContain(created.token);
      expect(listed).toHaveLength(1);
      expect(await ical.list(11)).toEqual([]);
      expect(h.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'reservations.feed_created', details: { feedName: 'Work' } }),
      );
    });

    it('draws distinct 256-bit tokens', async () => {
      const a = await ical.create(principal(10), { name: 'a', selection: selection({ ownOnly: true }) });
      const b = await ical.create(principal(10), { name: 'b', selection: selection({ ownOnly: true }) });
      expect(a.token).not.toBe(b.token);
    });

    it('requires at least one selector and caps the number of feeds', async () => {
      await expect(ical.create(principal(10), { name: 'x', selection: selection() })).rejects.toMatchObject({
        status: 400,
      });
      for (let i = 0; i < 20; i += 1)
        await ical.create(principal(10), { name: `f${i}`, selection: selection({ ownOnly: true }) });
      await expect(
        ical.create(principal(10), { name: 'x', selection: selection({ ownOnly: true }) }),
      ).rejects.toMatchObject({
        status: 409,
      });
    });

    it('renames and re-selects without changing the URL', async () => {
      const created = await ical.create(principal(10), { name: 'a', selection: selection({ resourceIds: [1] }) });
      const updated = await ical.update(principal(10), created.feed.id, {
        name: 'b',
        selection: selection({ resourceIds: [2] }),
      });
      expect(updated).toMatchObject({ name: 'b', selection: { resourceIds: [2] } });
      expect(await ical.renderForToken(created.token)).not.toBeNull();
      await expect(ical.update(principal(10), created.feed.id, { selection: selection() })).rejects.toBeInstanceOf(
        ReservationError,
      );
    });

    it('regenerate kills the old token at once; revoke kills the feed and is audited', async () => {
      const created = await ical.create(principal(10), { name: 'a', selection: selection({ ownOnly: true }) });
      const fresh = await ical.regenerate(principal(10), created.feed.id);
      expect(fresh.token).not.toBe(created.token);
      expect(await ical.renderForToken(created.token)).toBeNull();
      expect(await ical.renderForToken(fresh.token)).not.toBeNull();

      await ical.revoke(principal(10), created.feed.id);
      expect(await ical.renderForToken(fresh.token)).toBeNull();
      expect(await ical.list(10)).toEqual([]);
      expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'reservations.feed_revoked' }));
      await expect(ical.regenerate(principal(10), created.feed.id)).rejects.toMatchObject({ status: 404 });
      const row = await h.dataSource.getRepository(IcalFeedEntity).findOneByOrFail({ id: created.feed.id });
      expect(row.revokedAt).toBeInstanceOf(Date);
    });

    it('hides other users’ feeds', async () => {
      const created = await ical.create(principal(10), { name: 'a', selection: selection({ ownOnly: true }) });
      await expect(ical.update(principal(11), created.feed.id, { name: 'x' })).rejects.toMatchObject({ status: 404 });
      await expect(ical.revoke(principal(11), created.feed.id)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('content', () => {
    let token: string;
    beforeEach(async () => {
      token = (await ical.create(principal(10), { name: 'All', selection: selection({ resourceIds: [1, 2] }) })).token;
    });

    it('rejects unknown and malformed tokens', async () => {
      expect(await ical.renderForToken('x'.repeat(43))).toBeNull();
      expect(await ical.renderForToken('../../etc/passwd')).toBeNull();
      expect(await ical.renderForToken('')).toBeNull();
    });

    it('shows confirmed as CONFIRMED and pending as TENTATIVE; dropped statuses vanish', async () => {
      const confirmed = await p.book(10, 1, '2026-06-02T08:00:00', '2026-06-02T09:00:00');
      await h.settings.update(2, { approvalRequired: true });
      const pending = await p.book(10, 2, '2026-06-03T08:00:00', '2026-06-03T09:00:00');
      for (const status of ['cancelled', 'rejected', 'expired', 'no_show'] as const) {
        await insert({
          status,
          startTime: new Date('2026-06-04T08:00:00Z'),
          endTime: new Date('2026-06-04T09:00:00Z'),
        });
      }
      const calendar = await render(token);
      expect(calendar.events.map((e) => [e.uid, e.status])).toEqual([
        [`reservation-${confirmed.id}@attraccess`, 'CONFIRMED'],
        [`reservation-${pending.id}@attraccess`, 'TENTATIVE'],
      ]);
      expect(calendar.events[1].description).toBe('Waiting for approval');
      expect(calendar.events[0]).toMatchObject({
        dtstart: '20260602T080000Z',
        dtend: '20260602T090000Z',
        dtstamp: '20260601T080000Z',
      });
      expect(calendar.props['X-WR-CALNAME']).toBe('All');
    });

    it('uses the new end of early-ended bookings and keeps UIDs stable', async () => {
      const booking = await p.book(10, 1, '2026-06-01T08:00:00', '2026-06-01T10:00:00');
      const before = (await render(token)).events[0];
      h.setNow('2026-06-01T08:30:00Z');
      await h.reservations.endEarly(principal(10), booking.id);
      const after = (await render(token)).events[0];
      expect(after.uid).toBe(before.uid);
      expect(after.dtend).toBe('20260601T083000Z');
      expect(after.status).toBe('CONFIRMED');
    });

    it('covers 30 days back to maxAdvanceDays ahead', async () => {
      await insert({ startTime: new Date('2026-05-10T08:00:00Z'), endTime: new Date('2026-05-10T09:00:00Z') }); // 22 days back
      await insert({
        startTime: new Date('2026-04-20T08:00:00Z'),
        endTime: new Date('2026-04-20T09:00:00Z'),
        status: 'completed',
      }); // 42 days back
      await insert({ startTime: new Date('2026-06-30T08:00:00Z'), endTime: new Date('2026-06-30T09:00:00Z') }); // 29 days ahead
      await insert({ startTime: new Date('2026-07-05T08:00:00Z'), endTime: new Date('2026-07-05T09:00:00Z') }); // beyond 30
      expect((await render(token)).events.map((e) => e.dtstart)).toEqual(['20260510T080000Z', '20260630T080000Z']);
    });

    it('writes DST days in UTC without shifting events (spring forward in Europe/Berlin)', async () => {
      h.setNow('2026-03-25T08:00:00Z');
      await p.book(10, 1, '2026-03-28T09:00:00', '2026-03-28T10:00:00'); // 10:00 CET
      await p.book(10, 1, '2026-03-29T08:00:00', '2026-03-29T09:00:00'); // 10:00 CEST (after the shift)
      await p.book(10, 2, '2026-03-29T00:00:00', '2026-03-29T02:00:00'); // 01:00-04:00 local, two real hours across the gap
      const calendar = await render(token);
      expect(calendar.props['X-WR-TIMEZONE']).toBe('Europe/Berlin');
      expect(calendar.events.map((e) => [e.dtstart, e.dtend])).toEqual([
        ['20260328T090000Z', '20260328T100000Z'],
        ['20260329T000000Z', '20260329T020000Z'],
        ['20260329T080000Z', '20260329T090000Z'],
      ]);
      for (const event of calendar.events) {
        expect(parseIcalDate(event.dtend).getTime()).toBeGreaterThan(parseIcalDate(event.dtstart).getTime());
      }
    });

    it('survives long, non-ASCII feed names and notes (folding stays UTF-8 safe)', async () => {
      const long = await ical.create(principal(10), {
        name: 'Überlanger Kalender, mit; Sonderzeichen 日本語 🙂 '.repeat(4).slice(0, 100),
        selection: selection({ resourceIds: [1] }),
      });
      const booking = await p.book(10, 1, '2026-06-02T08:00:00', '2026-06-02T09:00:00');
      await h.dataSource
        .getRepository(ReservationEntity)
        .update({ id: booking.id }, { note: 'Notiz; mit, Komma\nund Zeile 日本語 🙂'.repeat(5) });
      const calendar = await render(long.token);
      expect(calendar.events[0].description).toContain('Notiz; mit, Komma\nund Zeile 日本語 🙂');
    });
  });

  describe('visibility and redaction', () => {
    it('names the holder only to the holder and to managers', async () => {
      const mine = await p.book(10, 1, '2026-06-02T08:00:00', '2026-06-02T09:00:00');
      await h.dataSource.getRepository(ReservationEntity).update({ id: mine.id }, { note: 'my note' });
      const others = await p.book(11, 1, '2026-06-03T08:00:00', '2026-06-03T09:00:00');
      await h.dataSource.getRepository(ReservationEntity).update({ id: others.id }, { note: 'secret' });
      const user = await ical.create(principal(10), { name: 'u', selection: selection({ resourceIds: [1] }) });
      const asUser = await render(user.token);
      expect(asUser.events.map((e) => e.summary)).toEqual(['Resource 1 – user10', 'Resource 1 – Reserved']);
      expect(asUser.events[0].description).toBe('my note');
      expect(JSON.stringify(asUser)).not.toMatch(/user11|secret/);

      h.makeManager(99, 1);
      const manager = await ical.create(principal(99), { name: 'm', selection: selection({ resourceIds: [1] }) });
      expect(events(await render(manager.token))).toEqual(['Resource 1 – user10', 'Resource 1 – user11']);
    });

    it("names the holder to viewers who may see the machine's current user, but never shows the note", async () => {
      const others = await p.book(11, 1, '2026-06-03T08:00:00', '2026-06-03T09:00:00');
      await h.dataSource.getRepository(ReservationEntity).update({ id: others.id }, { note: 'secret' });
      h.allowAttribution(10, 1);
      const user = await ical.create(principal(10), { name: 'u', selection: selection({ resourceIds: [1] }) });
      const rendered = await render(user.token);
      expect(events(rendered)).toEqual(['Resource 1 – user11']);
      expect(JSON.stringify(rendered)).not.toContain('secret');
      const other = await ical.create(principal(12), { name: 'o', selection: selection({ resourceIds: [1] }) });
      expect(events(await render(other.token))).toEqual(['Resource 1 – Reserved']);
    });

    it('resolves manager rights with one lookup (resources.update sees every holder)', async () => {
      await p.book(11, 1, '2026-06-03T08:00:00', '2026-06-03T09:00:00');
      await p.book(11, 2, '2026-06-03T08:00:00', '2026-06-03T09:00:00');
      const managed = jest.spyOn(h.access, 'managedResourceIds');
      const isManager = jest.spyOn(h.access, 'isManager');
      h.grant(50, 'resources.update');
      const feed = await ical.create(principal(50), { name: 'm', selection: selection({ resourceIds: [1, 2] }) });
      expect(events(await render(feed.token))).toEqual(['Resource 1 – user11', 'Resource 2 – user11']);
      expect(managed).toHaveBeenCalledTimes(1);
      expect(isManager).not.toHaveBeenCalled();

      managed.mockClear();
      const own = await ical.create(principal(11), { name: 'o', selection: selection({ ownOnly: true }) });
      expect(events(await render(own.token))).toHaveLength(2);
      expect(managed).not.toHaveBeenCalled();
    });

    it('stops serving feeds of deleted or disabled owners', async () => {
      const feed = await ical.create(principal(10), { name: 'u', selection: selection({ resourceIds: [1] }) });
      expect(await ical.renderForToken(feed.token)).not.toBeNull();
      inactive.add(10);
      expect(await ical.renderForToken(feed.token)).toBeNull();
      const controller = new IcalPublicController(ical, h.clock);
      await expect(
        controller.feed(`${feed.token}.ics`, { ip: '203.0.113.1' }, { setHeader: () => undefined }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('speaks German in the owner’s language', async () => {
      p.info.languages.set(10, 'de');
      await p.book(11, 1, '2026-06-03T08:00:00', '2026-06-03T09:00:00');
      const feed = await ical.create(principal(10), { name: 'u', selection: selection({ resourceIds: [1] }) });
      expect(events(await render(feed.token))).toEqual(['Resource 1 – Reserviert']);
    });

    it('resolves resources at request time: hidden and disabled resources drop out', async () => {
      await p.book(11, 1, '2026-06-03T08:00:00', '2026-06-03T09:00:00');
      await p.book(11, 2, '2026-06-03T10:00:00', '2026-06-03T11:00:00');
      const feed = await ical.create(principal(10), { name: 'u', selection: selection({ resourceIds: [1, 2] }) });
      expect(events(await render(feed.token))).toHaveLength(2);
      hidden.add(1);
      expect(events(await render(feed.token))).toEqual(['Resource 2 – Reserved']);
      hidden.clear();
      await h.settings.update(2, { enabled: false });
      expect(events(await render(feed.token))).toEqual(['Resource 1 – Reserved']);
    });
  });

  describe('selection variants', () => {
    beforeEach(async () => {
      await p.book(10, 1, '2026-06-03T08:00:00', '2026-06-03T09:00:00');
      await p.book(11, 1, '2026-06-03T10:00:00', '2026-06-03T11:00:00');
      await p.book(11, 2, '2026-06-03T08:00:00', '2026-06-03T09:00:00');
      await p.book(10, 3, '2026-06-03T08:00:00', '2026-06-03T09:00:00');
      await p.book(11, 3, '2026-06-03T10:00:00', '2026-06-03T11:00:00');
    });
    const feedFor = async (patch: Partial<IcalSelectionDto>) =>
      render((await ical.create(principal(10), { name: 'f', selection: selection(patch) })).token);

    it('resources', async () => expect((await feedFor({ resourceIds: [2] })).events).toHaveLength(1));
    it('groups', async () => {
      groups.set(7, [2, 3]);
      expect((await feedFor({ groupIds: [7] })).events).toHaveLength(3);
    });
    it('introduced: canStart per enabled resource, host-wide list only for supervision-required ones', async () => {
      const canStart = jest.fn(async (_userId: number, resourceId: number) => {
        if (resourceId === 1) throw new Error('resource deleted');
        return {
          allowed: resourceId === 3,
          requiresSupervision: resourceId === 2,
          supervisionAllowed: resourceId === 2,
        };
      });
      const listResourceIdsIntroduced = jest.fn(async () => [2, 3, 42]);
      Object.assign(h.context.resourceAccess, { canStart, listResourceIdsIntroduced });
      // Resource 2 only allows supervised starts for this user: not introduced (same as canControllResource).
      expect((await feedFor({ introduced: true })).events).toHaveLength(2);
      expect(listResourceIdsIntroduced).not.toHaveBeenCalled();
      expect(canStart.mock.calls.map(([, id]) => id).sort()).toEqual([1, 2, 3]);
      // On supervision-required resources canStart never says "allowed": ask the host-wide list.
      supervisionRequired.add(2);
      expect((await feedFor({ introduced: true })).events).toHaveLength(3);
      expect(listResourceIdsIntroduced).toHaveBeenCalledTimes(1);
    });
    it('introduced: skips disabled and already selected resources', async () => {
      const canStart = jest.fn(async (_userId: number, _resourceId: number) => ({
        allowed: true,
        requiresSupervision: false,
        supervisionAllowed: false,
      }));
      Object.assign(h.context.resourceAccess, { canStart });
      await h.settings.update(1, { enabled: false });
      expect((await feedFor({ introduced: true, resourceIds: [3] })).events).toHaveLength(3);
      expect(canStart.mock.calls.map(([, id]) => id)).toEqual([2]);
    });
    it('maintained', async () => {
      h.makeManager(10, 2);
      expect((await feedFor({ maintained: true })).events).toHaveLength(1);
    });
    it('only my own bookings, on its own across all resources', async () => {
      expect((await feedFor({ ownOnly: true })).events.map((e) => e.summary)).toEqual([
        'Resource 1 – user10',
        'Resource 3 – user10',
      ]);
    });
    it('only my own bookings narrowed to selected resources', async () => {
      expect((await feedFor({ ownOnly: true, resourceIds: [3] })).events).toHaveLength(1);
    });
    it('unions selectors without duplicates', async () => {
      groups.set(7, [1, 2]);
      expect((await feedFor({ groupIds: [7], resourceIds: [1, 3] })).events).toHaveLength(5);
    });
  });

  describe('controllers', () => {
    it('guards management with auth but leaves the token endpoint public', () => {
      expect(Reflect.getMetadata('__guards__', IcalFeedsController)).toEqual(expect.arrayContaining([DualAuthGuard]));
      expect(Reflect.getMetadata('__guards__', IcalPublicController)).toBeUndefined();
      expect(Reflect.getMetadata('__guards__', IcalPublicController.prototype.feed)).toBeUndefined();
    });

    it('serves calendars, answers 404 for unknown tokens and rate limits', async () => {
      const created = await ical.create(principal(10), { name: 'a', selection: selection({ ownOnly: true }) });
      const controller = new IcalPublicController(ical, h.clock);
      const headers: Record<string, string> = {};
      const response = { setHeader: (name: string, value: string) => (headers[name] = value) };
      const request = { ip: '203.0.113.9' };
      const body = await controller.feed(`${created.token}.ics`, request, response);
      expect(validateIcal(body).props['VERSION']).toBe('2.0');
      await expect(controller.feed('nope.ics', request, response)).rejects.toMatchObject({ status: 404 });
      await expect(controller.feed(created.token, request, response)).rejects.toMatchObject({ status: 404 });
      await ical.revoke(principal(10), created.feed.id);
      await expect(controller.feed(`${created.token}.ics`, request, response)).rejects.toMatchObject({ status: 404 });

      let limited: { status: number } | null = null;
      for (let i = 0; i < 70 && !limited; i += 1) {
        limited = await controller.feed(`${created.token}.ics`, request, response).then(
          () => null,
          (error) => (error.status === 429 ? error : null),
        );
      }
      expect(limited).toMatchObject({ status: 429 });
      expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
    });

    describe('rate limiting', () => {
      const response = { setHeader: () => undefined };
      const status = (promise: Promise<unknown>) =>
        promise.then(
          () => 200,
          (error) => error.status as number,
        );
      let hit: jest.SpyInstance;
      beforeEach(() => {
        hit = jest.spyOn(RateLimiter.prototype, 'hit');
      });
      afterEach(() => hit.mockRestore());

      it('answers malformed tokens 404 without touching any limiter', async () => {
        const controller = new IcalPublicController(ical, h.clock);
        const request = { ip: '203.0.113.7' };
        for (const file of ['x.ics', `${'a'.repeat(10_000)}.ics`, '../../etc/passwd.ics', 'nope']) {
          expect(await status(controller.feed(file, request, response))).toBe(404);
        }
        for (let i = 0; i < ICAL_RATE_LIMIT.perIpPerMinute + 10; i += 1) {
          expect(await status(controller.feed('short.ics', request, response))).toBe(404);
        }
        expect(hit).not.toHaveBeenCalled();
      });

      it('keys the per-feed window on the token hash and skips it once the IP is refused', async () => {
        const controller = new IcalPublicController(ical, h.clock);
        const request = { ip: '203.0.113.8' };
        const token = 'A'.repeat(43);
        await controller.feed(`${token}.ics`, request, response).catch(() => undefined);
        expect(hit.mock.calls.map(([key]) => key)).toEqual(['203.0.113.8', `203.0.113.8|${hashToken(token)}`]);

        // Distinct (unknown) tokens exhaust the per-IP budget; from then on only the IP limiter is asked.
        for (let i = 1; i < ICAL_RATE_LIMIT.perIpPerMinute; i += 1) {
          expect(await status(controller.feed(`${String(i).padStart(43, 'B')}.ics`, request, response))).toBe(404);
        }
        hit.mockClear();
        expect(await status(controller.feed(`${token}.ics`, request, response))).toBe(429);
        expect(hit.mock.calls.map(([key]) => key)).toEqual(['203.0.113.8']);
        // Another IP is unaffected.
        expect(await status(controller.feed(`${token}.ics`, { ip: '203.0.113.9' }, response))).toBe(404);
      });
    });
  });
});
