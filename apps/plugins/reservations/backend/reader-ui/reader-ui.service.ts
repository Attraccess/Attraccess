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

    // The booking the details are about: your own running one, else the running one, else the next one.
    const own = userId === undefined ? undefined : this.ownBooking(userId, running, upcoming, nowMs, early);
    const subject = own ?? running ?? upcoming[0];
    if (!subject) return [];

    const nameOf = this.nameResolver(ctx);
    const holder = own ? undefined : await nameOf(subject);
    const state = this.describe(subject, running === subject, settings, clock, holder, own !== undefined);
    // The next start changes the state even when the details are about another booking (your own one in
    // the early check-in window), and local midnight changes the weekday prefix of the times.
    const boundaries = [state.boundary, nextLocalMidnight(now, clock.timeZone).getTime()];
    if (upcoming[0]) boundaries.push(upcoming[0].startTime.getTime());
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
    let sessionBooking: ReservationEntity | undefined;
    if (ctx.sessionActive === true && userId !== undefined && settings.confirmWindowMinutes > 0) {
      const window = settings.confirmWindowMinutes * MINUTE_MS;
      const next = upcoming.find((r) => r.userId !== userId && r.startTime.getTime() - nowMs <= window);
      if (next) sessionBooking = next;
      else {
        // The confirm window opens later: re-evaluate then.
        const opens = upcoming.find((r) => r.userId !== userId);
        if (opens) boundaries.push(opens.startTime.getTime() - window);
      }
    }

    // One fact, one block: a booking appears in exactly one details slot. While a usage runs the session slot is
    // the most specific, so when it shows the subject booking the body stays silent; idle, the body carries it
    // (there is no header at all).
    if (subject !== sessionBooking) {
      add(SLOT.RESOURCE_DETAILS_BODY, 'body', { t: 'text', text: state.body, style: 'body' }, state.body);
    }
    if (sessionBooking) {
      const next = sessionBooking;
      const sessionHolder = next === subject ? holder : await nameOf(next);
      const text = readerTexts.sessionReserved(next.startTime, next.endTime, clock, sessionHolder);
      add(
        SLOT.RESOURCE_DETAILS_SESSION,
        'reserved-soon',
        {
          t: 'row',
          c: [
            { t: 'text', text, style: 'small', fill: true },
            { t: 'countdown', to: next.startTime, tone: 'warning' },
          ],
        },
        text,
        'warning',
      );
      boundaries.push(next.startTime.getTime());
    }
    if (userId !== undefined && upcoming.length > 0 && !own) {
      // Your early check-in window may open before the next booking starts.
      boundaries.push(...upcoming.filter((r) => r.userId === userId).map((r) => r.startTime.getTime() - early));
    }

    const expiresAt = new Date(Math.min(...boundaries.filter((at) => at > nowMs)));
    return contributions.map((c) => ({ ...c, expiresAt }));
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
  ): { row: string; body: string; tone: ReaderUiTone; boundary: number } {
    const { startTime, endTime } = booking;
    const deadline = new Date(
      Math.min(startTime.getTime() + settings.checkInGraceMinutes * MINUTE_MS, endTime.getTime()),
    );
    const awaitingCheckIn = settings.checkInEnabled && !booking.checkedInAt && clock.now.getTime() < deadline.getTime();
    const checkIn = awaitingCheckIn ? readerTexts.checkInSuffix(deadline, clock) : '';
    const boundary = awaitingCheckIn ? deadline.getTime() : isRunning ? endTime.getTime() : startTime.getTime();

    if (isOwn) {
      return {
        row: readerTexts.rowOwnUntil(endTime, clock),
        body: readerTexts.own(startTime, endTime, clock) + checkIn,
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
      body: readerTexts.reserved(startTime, endTime, clock, holder) + checkIn,
      tone: 'warning',
      boundary,
    };
  }
}
