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
 * Reservation state on Attractap readers (resource list row, details header/body, session area).
 *
 * Privacy: with no `ctx.userId` (a signed-out reader) the output has no holder name and no personal
 * data, whatever the settings, and no user or permission lookup runs. Names appear only for a card user
 * who is a manager of the resource, or for any card user when the resource opted in
 * (`showNamesOnReaders`). List rows never carry names.
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

    const nameOf = this.nameResolver(ctx, settings);
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
    if (state.header) {
      add(SLOT.RESOURCE_DETAILS_HEADER, 'header', { t: 'text', text: state.header, style: 'title' }, state.header);
    }
    add(SLOT.RESOURCE_DETAILS_BODY, 'body', { t: 'text', text: state.body, style: 'body' }, state.body);

    // Session area (card session only): another user's booking starts within the confirm window.
    if (userId !== undefined && settings.confirmWindowMinutes > 0) {
      const window = settings.confirmWindowMinutes * MINUTE_MS;
      const next = upcoming.find((r) => r.userId !== userId && r.startTime.getTime() - nowMs <= window);
      if (next) {
        const sessionHolder = await nameOf(next);
        const text = readerTexts.sessionReservedFrom(next.startTime, clock, sessionHolder);
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
      } else {
        // The confirm window opens later: re-evaluate then.
        const opens = upcoming.find((r) => r.userId !== userId);
        if (opens) boundaries.push(opens.startTime.getTime() - window);
      }
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
   * viewer's own booking, and for viewers who may not see names. The manager check is only paid when the
   * resource did not opt in (names show either way then) and runs once per evaluation; each holder's
   * name is looked up at most once.
   */
  private nameResolver(
    ctx: ReaderUiContext,
    settings: ResourceSettings,
  ): (booking: ReservationEntity) => Promise<string | undefined> {
    const userId = ctx.userId;
    if (userId === undefined) return async () => undefined;
    let allowed: Promise<boolean> | undefined;
    const mayShow = () =>
      (allowed ??= settings.showNamesOnReaders ? Promise.resolve(true) : this.access.isManager(userId, ctx.resourceId));
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
  ): { row: string; header?: string; body: string; tone: ReaderUiTone; boundary: number } {
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
        header: readerTexts.headerFreeUntil(startTime, clock),
        body: readerTexts.reserved(startTime, endTime, clock, holder),
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
