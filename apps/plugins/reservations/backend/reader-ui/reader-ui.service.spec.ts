import {
  READER_UI_CAPABILITIES_NONE,
  READER_UI_LIMITS,
  READER_UI_RESERVED_STATUS_STRINGS,
  READER_UI_SLOT_NODE_BUDGET,
  type ReaderSlotContribution,
  type ReaderUiContext,
  type ReaderUiNode,
} from '@attraccess/plugins-backend-sdk';
import { ReservationEntity } from '../entities/reservation.entity';
import { Harness, createHarness } from '../testing/harness.test-utils';
import { BackgroundServices, createBackgroundServices } from '../testing/background-services.test-utils';
import { nextLocalMidnight, readerName, readerTexts, readerTime } from './texts';

// Harness zone is Europe/Berlin (UTC+2 in June): 12:00Z is 14:00 local.
const HOLDER = 10;
const OTHER = 11;
const MANAGER = 99;

describe('ReaderUiService', () => {
  let h: Harness;
  let p: BackgroundServices;

  const ctx = (patch: Partial<ReaderUiContext> = {}): ReaderUiContext => ({
    readerId: 1,
    resourceId: 1,
    capabilities: READER_UI_CAPABILITIES_NONE,
    language: 'en',
    ...patch,
  });
  const slots = async (patch: Partial<ReaderUiContext> = {}) => p.readerUi.getSlotContributions(ctx(patch));
  const textOf = (tree: ReaderUiNode): string[] =>
    tree.t === 'text' || tree.t === 'badge'
      ? [tree.text]
      : tree.t === 'col' || tree.t === 'row'
        ? (tree.c ?? []).flatMap(textOf)
        : [];
  const get = (list: ReaderSlotContribution[], slotId: string) => list.find((c) => c.slotId === slotId);
  const row = (list: ReaderSlotContribution[]) => textOf(get(list, 'resourceList.row.status')?.tree as ReaderUiNode)[0];
  const body = (list: ReaderSlotContribution[]) => textOf(get(list, 'resource.details.body')?.tree as ReaderUiNode)[0];
  const header = (list: ReaderSlotContribution[]) => {
    const tree = get(list, 'resource.details.header')?.tree;
    return tree ? textOf(tree)[0] : undefined;
  };

  /** Same rules as the host validator (apps/api reader-ui.validation), which a plugin cannot import. */
  const expectHostValid = (list: ReaderSlotContribution[]) => {
    const latin1 = /^[\u0020-\u007e\u00a0-\u00ff]+$/;
    const normalize = (text: string) =>
      text
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    const nodes = (tree: ReaderUiNode): number =>
      1 + (tree.t === 'col' || tree.t === 'row' ? (tree.c ?? []).reduce((sum, c) => sum + nodes(c), 0) : 0);
    const keys = new Set<string>();
    for (const c of list) {
      expect(`${c.slotId}/${c.key}`).not.toEqual(expect.stringMatching(/^$/));
      expect(keys.has(`${c.slotId}/${c.key}`)).toBe(false);
      keys.add(`${c.slotId}/${c.key}`);
      expect(c.key).toMatch(READER_UI_LIMITS.idPattern);
      expect(nodes(c.tree)).toBeLessThanOrEqual(READER_UI_SLOT_NODE_BUDGET[c.slotId]);
      const texts = [...textOf(c.tree), c.fallback?.text ?? ''];
      for (const text of texts) {
        expect(text).toMatch(latin1);
        expect(text.length).toBeLessThanOrEqual(
          c.slotId === 'resourceList.row.status' ? READER_UI_LIMITS.maxListRowChars : READER_UI_LIMITS.maxTextChars,
        );
        expect(READER_UI_RESERVED_STATUS_STRINGS).not.toContain(normalize(text));
      }
      expect(c.fallback?.text).toBeTruthy();
      expect(c.expiresAt).toBeInstanceOf(Date);
      if (c.slotId === 'resourceList.row.status') expect(['text', 'badge']).toContain(c.tree.t);
    }
  };

  beforeEach(async () => {
    h = await createHarness();
    p = createBackgroundServices(h);
    await h.enable(1, { maxDurationMinutes: 1440, timeStepMinutes: 5, minDurationMinutes: 5 });
    await h.settings.warmUp();
    h.makeManager(MANAGER, 1);
    h.setNow('2026-06-01T10:00:00Z'); // 12:00 local
  });
  afterEach(() => h.close());

  /** Books as if made earlier in the morning, so bookings that already started pass the rules. */
  const book = async (user: number, start: string, end: string) => {
    const now = h.clock();
    h.setNow('2026-06-01T07:00:00Z');
    try {
      return await p.book(user, 1, start, end);
    } finally {
      h.setNow(now);
    }
  };

  describe('nothing to show', () => {
    it('contributes nothing and never touches the database when reservations are disabled', async () => {
      const getRepository = jest.spyOn(h.dataSource, 'getRepository');
      const query = jest.spyOn(h.store, 'findConfirmedOverlapping');
      expect(await slots({ resourceId: 2 })).toEqual([]);
      expect(await slots({ resourceId: 2, userId: MANAGER })).toEqual([]);
      expect(getRepository).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    });

    it('contributes nothing without a booking, with one indexed query', async () => {
      const query = jest.spyOn(h.store, 'findConfirmedOverlapping');
      expect(await slots()).toEqual([]);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('contributes nothing for a booking that starts later than 24 h from now', async () => {
      await book(HOLDER, '2026-06-02T10:15:00', '2026-06-02T12:00:00');
      expect(await slots()).toEqual([]);
    });

    it('ignores pending, cancelled, no-show, expired and ended-early bookings', async () => {
      const rows = h.dataSource.getRepository(ReservationEntity);
      await h.enable(1, { approvalRequired: true });
      await book(HOLDER, '2026-06-01T12:00:00', '2026-06-01T14:00:00'); // stays pending
      await h.enable(1, { approvalRequired: false });
      const cancelled = await book(HOLDER, '2026-06-01T17:00:00', '2026-06-01T18:00:00');
      await h.reservations.cancel({ userId: HOLDER, authenticationMethod: 'session' }, cancelled.id);
      expect(await slots()).toEqual([]);
      for (const status of ['no_show', 'expired', 'completed'] as const) {
        const booked = await book(HOLDER, '2026-06-01T15:00:00', '2026-06-01T16:00:00');
        await rows.update({ id: booked.id }, { status });
        expect(await slots()).toEqual([]);
        await rows.delete({ id: booked.id });
      }
    });
  });

  describe('signed out (public)', () => {
    it('free until the next booking (same day), en and de', async () => {
      await book(HOLDER, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      const en = await slots();
      expect(row(en)).toBe('Free until 14:00');
      expect(header(en)).toBe('Free until 14:00');
      expect(body(en)).toBe('Reserved 14:00-16:00');
      expect(get(en, 'resource.details.session')).toBeUndefined();
      const de = await slots({ language: 'de' });
      expect(row(de)).toBe('Frei bis 14:00');
      expect(header(de)).toBe('Frei bis 14:00');
      expect(body(de)).toBe('Reserviert 14:00-16:00');
      expectHostValid(en);
      expectHostValid(de);
    });

    it('adds a short weekday for a time on another local day', async () => {
      await book(HOLDER, '2026-06-02T06:00:00', '2026-06-02T08:30:00'); // Tue 08:00-10:30 local
      const en = await slots();
      expect(row(en)).toBe('Free until Tue 08:00');
      expect(body(en)).toBe('Reserved Tue 08:00-Tue 10:30');
      const de = await slots({ language: 'de' });
      expect(row(de)).toBe('Frei bis Di 08:00');
      expectHostValid(en);
      expectHostValid(de);
    });

    it('running, not checked in: check in by the deadline', async () => {
      await book(HOLDER, '2026-06-01T08:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T08:05:00Z'); // 10:05 local, started 10:00
      const en = await slots();
      expect(row(en)).toBe('Res., check in by 10:15');
      expect(body(en)).toBe('Reserved 10:00-16:00 (check in by 10:15)');
      expect(header(en)).toBeUndefined();
      const de = await slots({ language: 'de' });
      expect(row(de)).toBe('Res., Check-in bis 10:15');
      expect(body(de)).toBe('Reserviert 10:00-16:00 (Check-in bis 10:15)');
      expectHostValid(en);
      expectHostValid(de);
    });

    it('check-in row never carries a name; the name only goes into the details', async () => {
      await book(HOLDER, '2026-06-01T08:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T08:05:00Z');
      const out = await slots();
      expect(row(out)).toBe('Res., check in by 10:15');
      expect(body(out)).toBe('Reserved 10:00-16:00 (check in by 10:15)');
      // A manager may see the name: the details carry it, the row stays the same.
      const manager = await slots({ userId: MANAGER });
      expect(row(manager)).toBe('Res., check in by 10:15');
      expect(body(manager)).toBe('Reserved by user10 10:00-16:00 (check in by 10:15)');
      const managerDe = await slots({ userId: MANAGER, language: 'de' });
      expect(row(managerDe)).toBe('Res., Check-in bis 10:15');
      expect(body(managerDe)).toBe('Reserviert von user10 10:00-16:00 (Check-in bis 10:15)');
      // Somebody who may not see names gets the unnamed form; with core's attribution rule they see the name.
      expect(body(await slots({ userId: OTHER }))).toBe('Reserved 10:00-16:00 (check in by 10:15)');
      h.allowAttribution(OTHER, 1);
      const attributed = await slots({ userId: OTHER });
      expect(row(attributed)).toBe('Res., check in by 10:15');
      expect(body(attributed)).toBe('Reserved by user10 10:00-16:00 (check in by 10:15)');
      for (const slot of [out, manager, managerDe, attributed]) expectHostValid(slot);
    });

    it('check-in row: "check in by" while it fits 24 characters, without "by" for a weekday time', () => {
      const clock = (lang: 'en' | 'de') => ({ lang, timeZone: 'Europe/Berlin', now: new Date('2026-06-01T08:05:00Z') });
      const today = new Date('2026-06-01T08:15:00Z');
      expect(readerTexts.rowCheckInBy(today, clock('en'))).toBe('Res., check in by 10:15');
      expect(readerTexts.rowCheckInBy(today, clock('de'))).toBe('Res., Check-in bis 10:15');
      const wednesday = new Date('2026-06-03T08:15:00Z');
      expect(readerTexts.rowCheckInBy(wednesday, clock('en'))).toBe('Res., check-in Wed 10:15');
      expect(readerTexts.rowCheckInBy(wednesday, clock('de'))).toBe('Res., Check-in Mi 10:15');
      for (const lang of ['en', 'de'] as const) {
        for (const at of [today, wednesday])
          expect(readerTexts.rowCheckInBy(at, clock(lang)).length).toBeLessThanOrEqual(24);
      }
    });

    it('check-in row with the weekday prefix when the deadline is on another day', async () => {
      await book(HOLDER, '2026-06-01T21:50:00', '2026-06-02T02:00:00'); // 23:50 local Monday
      h.setNow('2026-06-01T21:55:00Z'); // 23:55 local, deadline 00:05 Tuesday
      const en = await slots();
      expect(row(en)).toBe('Res., check-in Tue 00:05');
      expect(row(en).length).toBeLessThanOrEqual(24);
      expect(body(en)).toBe('Reserved 23:50-Tue 04:00 (check in by Tue 00:05)');
      const de = await slots({ language: 'de' });
      expect(row(de)).toBe('Res., Check-in Di 00:05');
      expect(body(de)).toBe('Reserviert 23:50-Di 04:00 (Check-in bis Di 00:05)');
      expectHostValid(en);
      expectHostValid(de);
    });

    it('running and checked in: reserved until the end', async () => {
      const booking = await book(HOLDER, '2026-06-01T08:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T08:05:00Z');
      await h.reservations.markCheckedIn(booking.id, 5, h.clock());
      const en = await slots();
      expect(row(en)).toBe('Reserved until 16:00');
      expect(body(en)).toBe('Reserved 10:00-16:00');
      expect(row(await slots({ language: 'de' }))).toBe('Reserviert bis 16:00');
      expectHostValid(en);
    });

    it('running with check-in disabled: reserved until the end', async () => {
      await h.enable(1, { checkInEnabled: false });
      await book(HOLDER, '2026-06-01T08:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T08:05:00Z');
      expect(row(await slots())).toBe('Reserved until 16:00');
    });

    it('after the check-in deadline (before the scheduler marks the no-show) it is plain "reserved"', async () => {
      await book(HOLDER, '2026-06-01T08:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T08:20:00Z');
      expect(row(await slots())).toBe('Reserved until 16:00');
    });

    it('keeps the German weekday forms within the row limit', async () => {
      await book(HOLDER, '2026-06-01T08:00:00', '2026-06-02T08:00:00'); // ends Tue 10:00 local
      h.setNow('2026-06-01T08:20:00Z');
      for (const language of ['en', 'de'] as const) {
        const list = await slots({ language });
        expect(row(list).length).toBeLessThanOrEqual(24);
        expectHostValid(list);
      }
      expect(row(await slots({ language: 'de' }))).toBe('Reserviert bis Di 10:00');
    });

    it('never contains names or user data, and does no user or permission lookups', async () => {
      // Everybody may see who uses the machine here: a signed-out reader still shows no name.
      h.allowAttribution(OTHER, 1);
      h.allowAttribution(HOLDER, 1);
      const names = jest.spyOn(h.directory, 'getUserNames');
      const manager = jest.spyOn(h.access, 'isManager');
      const attribution = jest.spyOn(h.access, 'attributionResourceIds');
      const states: [string, string, string][] = [
        ['2026-06-01T12:00:00', '2026-06-01T14:00:00', '2026-06-01T10:00:00Z'], // upcoming
        ['2026-06-01T08:00:00', '2026-06-01T14:00:00', '2026-06-01T08:05:00Z'], // running, no check-in
        ['2026-06-01T08:00:00', '2026-06-01T14:00:00', '2026-06-01T08:30:00Z'], // running
      ];
      for (const [start, end, now] of states) {
        const booking = await book(HOLDER, start, end);
        h.setNow(now);
        for (const language of ['en', 'de'] as const) {
          const list = await slots({ language });
          expect(list.length).toBeGreaterThan(0);
          const dump = JSON.stringify(list);
          expect(dump).not.toContain(`user${HOLDER}`);
          expect(dump).not.toContain('user');
          expect(dump).not.toContain(String(HOLDER) + '"');
        }
        await h.dataSource.getRepository(ReservationEntity).delete({ id: booking.id });
      }
      expect(names).not.toHaveBeenCalled();
      expect(manager).not.toHaveBeenCalled();
      expect(attribution).not.toHaveBeenCalled();
    });
  });

  describe('signed in (card session)', () => {
    it("the holder's own running booking", async () => {
      await book(HOLDER, '2026-06-01T08:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T08:05:00Z');
      const en = await slots({ userId: HOLDER });
      expect(row(en)).toBe('Your booking until 16:00');
      expect(body(en)).toBe('Your booking 10:00-16:00 (check in by 10:15)');
      const de = await slots({ userId: HOLDER, language: 'de' });
      expect(row(de)).toBe('Deine Buchung bis 16:00');
      expect(body(de)).toBe('Deine Buchung 10:00-16:00 (Check-in bis 10:15)');
      expectHostValid(en);
      expectHostValid(de);
    });

    it('drops the check-in hint once checked in, and keeps the row short on another day', async () => {
      const booking = await book(HOLDER, '2026-06-01T08:00:00', '2026-06-02T08:00:00');
      h.setNow('2026-06-01T08:05:00Z');
      await h.reservations.markCheckedIn(booking.id, 5, h.clock());
      for (const language of ['en', 'de'] as const) {
        const list = await slots({ userId: HOLDER, language });
        expect(body(list)).not.toMatch(/check/i);
        expect(row(list).length).toBeLessThanOrEqual(24);
        expectHostValid(list);
      }
      expect(row(await slots({ userId: HOLDER }))).toBe('Yours until Tue 10:00');
    });

    it("treats a booking that starts within the early check-in window as the holder's own", async () => {
      await book(HOLDER, '2026-06-01T10:10:00', '2026-06-01T12:00:00'); // 12:10 local, 10 min away
      const own = await slots({ userId: HOLDER });
      expect(row(own)).toBe('Your booking until 14:00');
      expect(body(own)).toBe('Your booking 12:10-14:00 (check in by 12:25)');
      expect(row(await slots({ userId: OTHER }))).toBe('Free until 12:10');
    });

    it('a manager sees the holder name on the details, never on the list row', async () => {
      await book(HOLDER, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      const en = await slots({ userId: MANAGER });
      expect(body(en)).toBe('Reserved by user10 14:00-16:00');
      expect(row(en)).toBe('Free until 14:00');
      expect(textOf(get(en, 'resourceList.row.status')?.tree as ReaderUiNode).join()).not.toContain('user10');
      expect(body(await slots({ userId: MANAGER, language: 'de' }))).toBe('Reserviert von user10 14:00-16:00');
      expectHostValid(en);
    });

    it("other users see the public texts unless they may see who uses the machine (core's rule)", async () => {
      await book(HOLDER, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      const names = jest.spyOn(h.directory, 'getUserNames');
      expect(body(await slots({ userId: OTHER }))).toBe('Reserved 14:00-16:00');
      expect(names).not.toHaveBeenCalled();

      h.allowAttribution(OTHER, 1);
      const en = await slots({ userId: OTHER });
      expect(body(en)).toBe('Reserved by user10 14:00-16:00');
      expect(row(en)).toBe('Free until 14:00');
      expect(body(await slots({ userId: OTHER, language: 'de' }))).toBe('Reserviert von user10 14:00-16:00');
      expectHostValid(en);
    });

    it('names the running holder after check-in, truncated and Latin-1 safe', async () => {
      h.allowAttribution(OTHER, 1);
      jest
        .spyOn(h.directory, 'getUserNames')
        .mockResolvedValue(new Map([[HOLDER, 'Alexandra-Maximiliane Überlänge 日本語']]));
      const booking = await book(HOLDER, '2026-06-01T08:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T08:30:00Z');
      await h.reservations.markCheckedIn(booking.id, 5, h.clock());
      const list = await slots({ userId: OTHER });
      expect(body(list)).toBe('Reserved by Alexandra-Maximi 10:00-16:00');
      expectHostValid(list);
      expect(readerName('Zoë 日本')).toBe('Zoë ??');
      // Letters outside Latin-1 lose their accents like the host sanitizer does, instead of turning into "?".
      expect(readerName('Łukasz Šimek')).toBe('Lukasz Simek');
      expect(readerName('Đorđe\tČ')).toBe('Dorde C');
      expect(readerName('O\u2019Brien\u2013Ng')).toBe("O'Brien-Ng");
      expect(readerName('Zoë\u0308')).toBe('Zoë');
    });

    it("session area: another user's booking within the confirm window, with a countdown", async () => {
      await book(HOLDER, '2026-06-01T10:40:00', '2026-06-01T12:00:00'); // 12:40 local, 40 min away
      const en = await slots({ userId: OTHER });
      const session = get(en, 'resource.details.session');
      expect(session?.tree).toEqual({
        t: 'row',
        c: [
          { t: 'text', text: 'Reserved from 12:40', style: 'small', fill: true },
          { t: 'countdown', to: new Date('2026-06-01T10:40:00Z'), tone: 'warning' },
        ],
      });
      expect(session?.fallback?.text).toBe('Reserved from 12:40');
      expect(
        textOf(get(await slots({ userId: OTHER, language: 'de' }), 'resource.details.session')?.tree as ReaderUiNode),
      ).toEqual(['Reserviert ab 12:40']);
      expectHostValid(en);
    });

    it('session area names the holder only for managers or viewers who may see who uses the machine', async () => {
      await book(HOLDER, '2026-06-01T10:40:00', '2026-06-01T12:00:00');
      const text = async (userId: number) =>
        textOf(get(await slots({ userId }), 'resource.details.session')?.tree as ReaderUiNode)[0];
      expect(await text(MANAGER)).toBe('Reserved by user10 from 12:40');
      expect(await text(OTHER)).toBe('Reserved from 12:40');
      h.allowAttribution(OTHER, 1);
      expect(await text(OTHER)).toBe('Reserved by user10 from 12:40');
    });

    it('no session slot outside the confirm window, for the holder, or when signed out', async () => {
      await book(HOLDER, '2026-06-01T11:30:00', '2026-06-01T12:30:00'); // 90 min away
      expect(get(await slots({ userId: OTHER }), 'resource.details.session')).toBeUndefined();
      h.setNow('2026-06-01T10:40:00Z');
      expect(get(await slots({ userId: HOLDER }), 'resource.details.session')).toBeUndefined();
      expect(get(await slots(), 'resource.details.session')).toBeUndefined();
    });
  });

  describe('expiry at the next state boundary', () => {
    const expiry = (list: ReaderSlotContribution[]) => [...new Set(list.map((c) => c.expiresAt?.toISOString()))];

    it('upcoming: the start of the booking', async () => {
      await book(HOLDER, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      expect(expiry(await slots())).toEqual(['2026-06-01T12:00:00.000Z']);
    });

    it('running, not checked in: the check-in deadline', async () => {
      await book(HOLDER, '2026-06-01T08:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T08:05:00Z');
      expect(expiry(await slots())).toEqual(['2026-06-01T08:15:00.000Z']);
    });

    it('running, checked in: the end of the booking', async () => {
      const booking = await book(HOLDER, '2026-06-01T08:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T08:05:00Z');
      await h.reservations.markCheckedIn(booking.id, 5, h.clock());
      expect(expiry(await slots())).toEqual(['2026-06-01T14:00:00.000Z']);
    });

    it('running, check-in turned off: the end of the booking', async () => {
      await h.enable(1, { checkInEnabled: false });
      await book(HOLDER, '2026-06-01T08:00:00', '2026-06-01T14:00:00');
      h.setNow('2026-06-01T08:05:00Z');
      expect(expiry(await slots())).toEqual(['2026-06-01T14:00:00.000Z']);
    });

    it('a short grace period is capped at the end', async () => {
      await book(HOLDER, '2026-06-01T08:00:00', '2026-06-01T08:10:00');
      h.setNow('2026-06-01T08:05:00Z');
      expect(expiry(await slots())).toEqual(['2026-06-01T08:10:00.000Z']);
    });

    it('signed in: also when the confirm window opens', async () => {
      await book(HOLDER, '2026-06-01T12:00:00', '2026-06-01T14:00:00'); // confirm window opens 11:00Z
      expect(expiry(await slots({ userId: OTHER }))).toEqual(['2026-06-01T11:00:00.000Z']);
    });

    it.each([
      ['Europe/Berlin', '2026-03-28T12:00:00Z', '2026-03-28T23:00:00.000Z'], // ordinary day before the spring change
      ['Europe/Berlin', '2026-03-29T10:00:00Z', '2026-03-29T22:00:00.000Z'], // 23-hour day
      ['Europe/Berlin', '2026-10-25T10:00:00Z', '2026-10-25T23:00:00.000Z'], // 25-hour day
      ['Asia/Kathmandu', '2026-06-01T12:00:00Z', '2026-06-01T18:15:00.000Z'], // UTC+5:45
      ['America/Santiago', '2026-09-05T16:00:00Z', '2026-09-06T04:00:00.000Z'], // midnight skipped: day starts 01:00
    ])('next local midnight in %s after %s', (timeZone, now, expected) => {
      expect(nextLocalMidnight(new Date(now), timeZone).toISOString()).toBe(expected);
    });

    it('local midnight, when the weekday of a time changes', async () => {
      await book(HOLDER, '2026-06-02T06:00:00', '2026-06-02T08:30:00'); // Tue 08:00 local
      expect(row(await slots())).toBe('Free until Tue 08:00');
      expect(expiry(await slots())).toEqual(['2026-06-01T22:00:00.000Z']); // Berlin midnight
      h.setNow('2026-06-01T22:00:00Z');
      expect(row(await slots())).toBe('Free until 08:00');
    });

    it("signed in holder: also when somebody else's earlier booking starts", async () => {
      await h.enable(1, { confirmWindowMinutes: 0, earlyCheckInMinutes: 60 });
      await book(OTHER, '2026-06-01T10:10:00', '2026-06-01T10:30:00');
      await book(HOLDER, '2026-06-01T10:40:00', '2026-06-01T12:00:00');
      const list = await slots({ userId: HOLDER });
      expect(row(list)).toBe('Your booking until 14:00');
      expect(expiry(list)).toEqual(['2026-06-01T10:10:00.000Z']);
    });

    it('signed in holder: also when the early check-in window opens', async () => {
      await book(HOLDER, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
      await h.enable(1, { confirmWindowMinutes: 0 });
      expect(expiry(await slots({ userId: HOLDER }))).toEqual(['2026-06-01T11:45:00.000Z']);
    });
  });

  it("looks a holder's name up once, even when the details and the session area both name them", async () => {
    await book(HOLDER, '2026-06-01T10:40:00', '2026-06-01T12:00:00');
    const names = jest.spyOn(h.directory, 'getUserNames');
    const list = await slots({ userId: MANAGER });
    expect(body(list)).toBe('Reserved by user10 12:40-14:00');
    expect(textOf(get(list, 'resource.details.session')?.tree as ReaderUiNode)[0]).toBe(
      'Reserved by user10 from 12:40',
    );
    expect(names).toHaveBeenCalledTimes(1);
  });

  it('uses at most one booking query per evaluation, signed in or not', async () => {
    await book(HOLDER, '2026-06-01T10:40:00', '2026-06-01T12:00:00');
    const query = jest.spyOn(h.store, 'findConfirmedOverlapping');
    const active = jest.spyOn(h.store, 'findActiveForResource');
    await slots();
    await slots({ userId: MANAGER });
    await slots({ userId: OTHER });
    expect(query).toHaveBeenCalledTimes(3);
    expect(active).not.toHaveBeenCalled();
  });

  it('writes times in the plugin timezone', async () => {
    await h.globalSettings.setTimezone('America/New_York');
    await book(HOLDER, '2026-06-01T12:00:00', '2026-06-01T14:00:00'); // 08:00-10:00 local
    expect(row(await slots())).toBe('Free until 08:00');
    expect(readerTime(new Date('2026-06-01T12:00:00Z'), { lang: 'en', timeZone: 'UTC', now: h.clock() })).toBe('12:00');
  });

  describe('weekday rule', () => {
    const berlin = (now: string) => ({ lang: 'en' as const, timeZone: 'Europe/Berlin', now: new Date(now) });

    it('decides "another local day" by the plugin timezone, not by UTC', () => {
      // 22:30Z on 31 May is already 00:30 on 1 June in Berlin: the same local day runs until 22:00Z.
      const clock = berlin('2026-05-31T22:30:00Z');
      expect(readerTime(new Date('2026-05-31T23:00:00Z'), clock)).toBe('01:00');
      expect(readerTime(new Date('2026-06-01T21:30:00Z'), clock)).toBe('23:30');
      expect(readerTime(new Date('2026-06-01T22:30:00Z'), clock)).toBe('Tue 00:30');
      expect(readerTime(new Date('2026-06-01T22:30:00Z'), { ...clock, lang: 'de' })).toBe('Di 00:30');
    });

    it('keeps local wall-clock times across the daylight saving changes', () => {
      // Berlin 2026-03-29 02:00 -> 03:00 and 2026-10-25 03:00 -> 02:00.
      const spring = berlin('2026-03-28T22:00:00Z');
      expect(readerTime(new Date('2026-03-29T00:59:00Z'), spring)).toBe('Sun 01:59');
      expect(readerTime(new Date('2026-03-29T01:00:00Z'), spring)).toBe('Sun 03:00');
      const autumn = berlin('2026-10-24T12:00:00Z');
      expect(readerTime(new Date('2026-10-25T00:30:00Z'), autumn)).toBe('Sun 02:30');
      expect(readerTime(new Date('2026-10-25T01:30:00Z'), autumn)).toBe('Sun 02:30');
      expect(readerTime(new Date('2026-10-25T23:30:00Z'), autumn)).toBe('Mon 00:30');
    });
  });
});
