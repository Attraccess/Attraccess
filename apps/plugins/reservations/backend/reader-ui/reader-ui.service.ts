import type {
  ReaderSlotContribution,
  ReaderUiContext,
  ReaderUiNode,
  ReaderUiTone,
} from '@attraccess/plugins-backend-sdk';
import { READER_UI_SLOTS } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { Clock, READER_HORIZON_MS, RESERVATION_CLOCK } from '../constants';
import type { ReservationEntity } from '../entities/reservation.entity';
import { hookDeadline, waitUntil } from '../hooks/runtime';
import { AccessService } from '../reservations/access.service';
import { heldBookings } from '../reservations/capacity';
import { DirectoryService } from '../reservations/directory.service';
import { ReservationStore } from '../reservations/reservation.store';
import { GlobalSettingsService } from '../settings/global-settings.service';
import { ResourceSettingsService } from '../settings/resource-settings.service';
import type { ResourceSettings } from '../settings/settings.model';
import { nextLocalMidnight, readerName, readerTexts, type ReaderClock } from './texts';

const MINUTE_MS = 60_000;

const SLOT = READER_UI_SLOTS;

/**
 * Reservation state on Attractap readers (resource list row, details body, session area).
 *
 * Privacy: with no `ctx.userId` (a signed-out reader) the output has no holder name and no personal
 * data, and no user or permission lookup runs. Names appear only for a card user who is a manager of the
 * resource or may see who uses the machine (core's usage attribution rule, the same as on the web). List
 * rows never carry names.
 *
 * Hot path (runs on every reader sync): disabled resources are answered from the settings cache without
 * touching the database; enabled ones cost one indexed booking query. Every contribution expires at the
 * next state boundary so the host re-evaluates by itself.
 */
@Injectable()
export class ReaderUiService {
  constructor(
    @Inject(ResourceSettingsService) private readonly settings: ResourceSettingsService,
    @Inject(GlobalSettingsService) private readonly globalSettings: GlobalSettingsService,
    @Inject(ReservationStore) private readonly store: ReservationStore,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(DirectoryService) private readonly directory: DirectoryService,
    @Inject(RESERVATION_CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * The zone reader times are written in, so the reader's clock agrees with the texts. Only for resources that
   * have reservations enabled; the host uses the server zone otherwise.
   */
  async getTimeZone(
    ctx: { readerId: number; resourceId: number },
    deadline = hookDeadline(),
  ): Promise<string | undefined> {
    if (!this.settings.isWarm) {
      await waitUntil(this.settings.whenReady(), deadline, 'Reservation settings are not loaded yet');
    }
    if (!this.settings.getCachedSettings(ctx.resourceId).enabled) return undefined;
    return this.globalSettings.getTimezone();
  }

  async getSlotContributions(ctx: ReaderUiContext, deadline = hookDeadline()): Promise<ReaderSlotContribution[]> {
    if (!this.settings.isWarm) {
      await waitUntil(this.settings.whenReady(), deadline, 'Reservation settings are not loaded yet');
    }
    const settings = this.settings.getCachedSettings(ctx.resourceId);
    if (!settings.enabled) return [];

    const now = this.clock();
    const nowMs = now.getTime();
    const bookings = await this.store.findConfirmedOverlapping(
      ctx.resourceId,
      now,
      new Date(nowMs + READER_HORIZON_MS),
    );
    if (bookings.length === 0) return [];

    const clock: ReaderClock = { lang: ctx.language, timeZone: await this.globalSettings.getTimezone(), now };
    const userId = ctx.userId;
    const early = settings.earlyCheckInMinutes * MINUTE_MS;
    const running = bookings.find((r) => r.startTime.getTime() <= nowMs);
    const upcoming = bookings.filter((r) => r.startTime.getTime() > nowMs);
    const limit = await this.directory.getSessionLimit(ctx.resourceId);
    const shared = limit > 1 ? await this.sharedSlots(ctx, bookings, limit, now) : null;

    // The booking the details are about: your own running one, else the running one, else the next one.
    const own = userId === undefined ? undefined : this.ownBooking(userId, running, upcoming, nowMs, early);
    // On a shared machine a running booking only shows as a warning when it holds the last free slot; while slots
    // remain, a short count replaces it, and an upcoming booking shows only if it would lack its slot.
    const subject = this.subjectOf(own, running, upcoming, shared);
    if (!subject && !(shared && shared.reserved > 0)) return [];

    const nameOf = this.nameResolver(ctx);
    const holder = !subject || own ? undefined : await nameOf(subject);
    const state = subject
      ? this.describe(subject, subject.startTime.getTime() <= nowMs, settings, clock, holder, own !== undefined)
      : this.reservedCount(shared?.reserved ?? 0, limit, bookings, nowMs, clock);
    // The next start changes the state even when the details are about another booking (your own one in
    // the early check-in window), and local midnight changes the weekday prefix of the times.
    const boundaries = [state.boundary, nextLocalMidnight(now, clock.timeZone).getTime()];
    if (upcoming[0]) boundaries.push(upcoming[0].startTime.getTime());
    // Every start and end changes the number of reserved slots on a shared machine.
    if (shared) boundaries.push(...bookings.flatMap((r) => [r.startTime.getTime(), r.endTime.getTime()]));
    const contributions: ReaderSlotContribution[] = [];

    const add = (
      slotId: ReaderSlotContribution['slotId'],
      key: string,
      tree: ReaderUiNode,
      text: string,
      tone?: ReaderUiTone,
    ) => contributions.push({ slotId, key, tree, fallback: { text, tone } });

    add(
      SLOT.RESOURCE_LIST_ROW_STATUS,
      'status',
      { t: 'badge', text: state.row, tone: state.tone },
      state.row,
      state.tone,
    );

    // Session area (card session while a usage runs): another user's booking starts within the confirm window.
    // The reader shows that slot only while a usage is active, so an idle resource keeps the text in the body.
    const countdown = this.sessionCountdown(ctx, settings, upcoming, shared, nowMs);
    const sessionBooking = countdown.next;
    if (countdown.opensAt !== undefined) boundaries.push(countdown.opensAt);

    // One fact, one block: a booking appears in exactly one details slot. While a usage runs the session slot is
    // the most specific, so when it shows the subject booking the body stays silent; idle, the body carries it
    // (there is no header at all).
    if (subject !== sessionBooking || !subject) {
      // One text node per clause: the reader wraps each on its own, so a time or the check-in note never dangles.
      const lines = state.body.map((text): ReaderUiNode => ({ t: 'text', text, style: 'body' }));
      add(
        SLOT.RESOURCE_DETAILS_BODY,
        'body',
        lines.length === 1 ? lines[0] : { t: 'col', gap: 0, c: lines },
        state.body.join(' '),
      );
    }
    if (sessionBooking) {
      const next = sessionBooking;
      const sessionHolder = next === subject ? holder : await nameOf(next);
      const { tree, text } = this.sessionTree(next, clock, sessionHolder);
      add(SLOT.RESOURCE_DETAILS_SESSION, 'reserved-soon', tree, text, 'warning');
      boundaries.push(next.startTime.getTime());
    }
    if (userId !== undefined && upcoming.length > 0 && !own) {
      // Your early check-in window may open before the next booking starts.
      boundaries.push(...upcoming.filter((r) => r.userId === userId).map((r) => r.startTime.getTime() - early));
    }

    const expiresAt = new Date(Math.min(...boundaries.filter((at) => at > nowMs)));
    return contributions.map((c) => ({ ...c, expiresAt }));
  }

  /**
   * The slot picture of a shared machine: sessions and the bookings that hold slots for the viewer's disadvantage.
   * `blocker`: the running booking to name when no free slot is left for the viewer (a signed-out reader counts as
   * nobody); `reserved`: running bookings (one per person); `nextLacking`: the next booking that would find no slot
   * at its start; `lacksSlotWith`: whether a booking would lack its slot if the viewer's session keeps running.
   */
  private async sharedSlots(
    ctx: ReaderUiContext,
    bookings: ReservationEntity[],
    limit: number,
    now: Date,
  ): Promise<{
    blocker: ReservationEntity | undefined;
    reserved: number;
    nextLacking: ReservationEntity | undefined;
    lacksSlotWith: (booking: ReservationEntity, viewerId: number | undefined) => boolean;
  }> {
    const nowMs = now.getTime();
    const sessions = await this.directory.getActiveSessions(ctx.resourceId);
    const inSession = new Set(sessions.map((session) => session.userId));
    const running = bookings.filter((r) => r.startTime.getTime() <= nowMs);
    const viewerId = ctx.userId ?? -1;
    const held = heldBookings({ confirmed: running, starterId: viewerId, inSession, at: now });
    const ownRunning = running.some((r) => r.userId === viewerId);
    const free = limit - sessions.length - held.length;
    const lacksSlotWith = (booking: ReservationEntity, viewer: number | undefined) =>
      sessions.length +
        heldBookings({ confirmed: bookings, starterId: viewer ?? -1, inSession, at: booking.startTime }).length >
      limit;
    return {
      blocker: !ownRunning && held.length > 0 && free <= 0 ? held[0] : undefined,
      reserved: new Set(running.map((r) => r.userId)).size,
      nextLacking: bookings.find(
        (r) =>
          r.startTime.getTime() > nowMs &&
          r.userId !== ctx.userId &&
          // Starting now takes one more slot (a signed-out reader has no starter yet).
          sessions.length +
            (ctx.userId === undefined ? 0 : 1) +
            heldBookings({ confirmed: bookings, starterId: viewerId, inSession, at: r.startTime }).length >
            limit,
      ),
      lacksSlotWith,
    };
  }

  /** Bookings run but slots remain: a short success text with the count (Latin-1, within the row limit). */
  private reservedCount(
    reserved: number,
    limit: number,
    bookings: ReservationEntity[],
    nowMs: number,
    clock: ReaderClock,
  ): { row: string; body: string[]; tone: ReaderUiTone; boundary: number } {
    const ends = bookings.filter((r) => r.startTime.getTime() <= nowMs).map((r) => r.endTime.getTime());
    return {
      row: readerTexts.rowSlotsReserved(reserved, limit, clock),
      body: [readerTexts.slotsReserved(reserved, limit, clock)],
      tone: 'success',
      boundary: Math.min(...ends),
    };
  }

  /**
   * The booking the details are about. On a shared machine a running booking only shows as a warning when it holds
   * the last free slot; while slots remain a short count replaces it (no subject), and an upcoming booking shows only
   * if it would lack its slot.
   */
  private subjectOf(
    own: ReservationEntity | undefined,
    running: ReservationEntity | undefined,
    upcoming: ReservationEntity[],
    shared: { blocker?: ReservationEntity; reserved: number; nextLacking?: ReservationEntity } | null,
  ): ReservationEntity | undefined {
    if (!shared) return own ?? running ?? upcoming[0];
    return own ?? shared.blocker ?? (shared.reserved > 0 ? undefined : shared.nextLacking);
  }

  /**
   * Session area: another user's booking that starts within the confirm window (on a shared machine only one the
   * viewer's session would leave without a slot), or when the window opens for the next one.
   */
  private sessionCountdown(
    ctx: ReaderUiContext,
    settings: ResourceSettings,
    upcoming: ReservationEntity[],
    shared: { lacksSlotWith(booking: ReservationEntity, viewerId: number | undefined): boolean } | null,
    nowMs: number,
  ): { next?: ReservationEntity; opensAt?: number } {
    const userId = ctx.userId;
    if (ctx.sessionActive !== true || userId === undefined || settings.confirmWindowMinutes <= 0) return {};
    const window = settings.confirmWindowMinutes * MINUTE_MS;
    const needsSlot = (r: ReservationEntity) => r.userId !== userId && (!shared || shared.lacksSlotWith(r, userId));
    const next = upcoming.find((r) => needsSlot(r) && r.startTime.getTime() - nowMs <= window);
    if (next) return { next };
    const opens = upcoming.find(needsSlot);
    return opens ? { opensAt: opens.startTime.getTime() - window } : {};
  }

  /** The session-area row: the booking's range and a countdown to its start. */
  private sessionTree(
    next: ReservationEntity,
    clock: ReaderClock,
    holder: string | undefined,
  ): { tree: ReaderUiNode; text: string } {
    const texts = readerTexts.sessionReserved(next.startTime, next.endTime, clock, holder);
    const lines = texts.map((text): ReaderUiNode => ({ t: 'text', text, style: 'small', fill: true }));
    return {
      tree: {
        t: 'row',
        c: [
          lines.length === 1 ? lines[0] : { t: 'col', gap: 0, fill: true, c: lines },
          { t: 'countdown', to: next.startTime, tone: 'warning' },
        ],
      },
      text: texts.join(' '),
    };
  }

  /** Your own booking while it runs or within the early check-in window before it starts. */
  private ownBooking(
    userId: number,
    running: ReservationEntity | undefined,
    upcoming: ReservationEntity[],
    nowMs: number,
    early: number,
  ): ReservationEntity | undefined {
    if (running?.userId === userId) return running;
    if (running) return undefined; // someone else's booking runs: that is what the reader shows
    return upcoming.find((r) => r.userId === userId && r.startTime.getTime() - nowMs <= early);
  }

  /**
   * Resolves holder names for this viewer: undefined for a signed-out reader (no lookup at all), for the
   * viewer's own booking, and for viewers who may not see names. Names go to managers of the resource and to
   * viewers who may see who uses the machine (core's usage attribution rule, as on the web). The permission
   * check runs once per evaluation and only when another user's booking is shown; each holder's name is looked
   * up at most once.
   */
  private nameResolver(ctx: ReaderUiContext): (booking: ReservationEntity) => Promise<string | undefined> {
    const userId = ctx.userId;
    if (userId === undefined) return async () => undefined;
    const { resourceId } = ctx;
    let allowed: Promise<boolean> | undefined;
    const mayShow = () =>
      (allowed ??= (async () =>
        (await this.access.isManager(userId, resourceId)) ||
        (await this.access.attributionResourceIds(userId, [resourceId])).has(resourceId))());
    const names = new Map<number, Promise<string | undefined>>();
    const lookup = async (holderId: number) => {
      const name = (await this.directory.getUserNames([holderId])).get(holderId);
      return name ? readerName(name) : undefined;
    };
    return async (booking) => {
      if (booking.userId === userId || !(await mayShow())) return undefined;
      if (!names.has(booking.userId)) names.set(booking.userId, lookup(booking.userId));
      return names.get(booking.userId);
    };
  }

  /** Texts, tone and next state boundary (epoch ms) of the subject booking. */
  private describe(
    booking: ReservationEntity,
    isRunning: boolean,
    settings: ResourceSettings,
    clock: ReaderClock,
    holder: string | undefined,
    isOwn: boolean,
  ): { row: string; body: string[]; tone: ReaderUiTone; boundary: number } {
    const { startTime, endTime } = booking;
    const deadline = new Date(
      Math.min(startTime.getTime() + settings.checkInGraceMinutes * MINUTE_MS, endTime.getTime()),
    );
    const awaitingCheckIn = settings.checkInEnabled && !booking.checkedInAt && clock.now.getTime() < deadline.getTime();
    const checkIn = awaitingCheckIn ? readerTexts.checkInLine(deadline, clock) : undefined;
    const boundary = awaitingCheckIn ? deadline.getTime() : isRunning ? endTime.getTime() : startTime.getTime();

    if (isOwn) {
      return {
        row: readerTexts.rowOwnUntil(endTime, clock),
        body: [readerTexts.own(startTime, endTime, clock), ...(checkIn ? [checkIn] : [])],
        tone: 'primary',
        boundary,
      };
    }
    if (!isRunning) {
      return {
        row: readerTexts.rowFreeUntil(startTime, clock),
        body: readerTexts.freeThenReserved(startTime, endTime, clock, holder),
        tone: 'success',
        boundary: startTime.getTime(),
      };
    }
    return {
      row: awaitingCheckIn ? readerTexts.rowCheckInBy(deadline, clock) : readerTexts.rowReservedUntil(endTime, clock),
      body: [...readerTexts.reserved(startTime, endTime, clock, holder), ...(checkIn ? [checkIn] : [])],
      tone: 'warning',
      boundary,
    };
  }
}
