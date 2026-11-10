import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Clock, PLUGIN_CONTEXT, READER_HORIZON_MS, RESERVATION_CLOCK } from '../constants';
import type { ReservationEntity } from '../entities/reservation.entity';
import { ReservationNotifications } from '../notifications/notifier.service';
import { ReservationService } from '../reservations/reservation.service';
import { ReservationStore } from '../reservations/reservation.store';
import { ResourceSettingsService } from '../settings/resource-settings.service';

export const TICK_INTERVAL_MS = 60_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const STILL_NEEDED_LEAD_MS = 48 * HOUR_MS;
const REMINDER_LEAD_MS = 24 * HOUR_MS;
/**
 * The overrun notice is about the moment a booking starts. It is only checked for bookings that started
 * within the last few ticks, so a running booking does not cost a session lookup every minute until it
 * ends; the window still covers a missed or delayed tick. A tick that runs later than this (e.g. after a
 * longer downtime) skips the notice.
 */
export const OVERRUN_CHECK_WINDOW_MS = 5 * TICK_INTERVAL_MS;
/** A no-show found later than this after its deadline (API was down) is recorded without a mail. */
export const NO_SHOW_NOTICE_WINDOW_MS = 5 * TICK_INTERVAL_MS;

/** When the booking became confirmed: the approval of a request, otherwise its creation. */
const confirmedAt = (r: ReservationEntity): number => (r.decidedAt ?? r.createdAt).getTime();

/**
 * The plugin's minute loop: expiry, no-show, completion, reminders, handover and overrun notices.
 * `setInterval(...).unref()` like the WAGO plugin (no @nestjs/schedule dependency).
 *
 * SINGLE API INSTANCE ASSUMPTION: the loop, the per-resource booking mutex, the settings cache and the
 * web step store are all in-process. Running two API instances would tick twice (every send is still
 * claimed in the database first, so mails stay exactly-once) but would not serialise bookings across
 * instances nor invalidate each other's settings cache. A distributed lock / leader election for the
 * scheduler, a cross-instance booking lock and cross-instance invalidation of the settings cache and
 * the web step store are tracked in ATT-1146.
 *
 * Idempotency: every one-shot send first claims its persisted flag with a single conditional UPDATE
 * (`... WHERE flag IS NULL`, proceed only if one row changed) and sends afterwards. A restart or a
 * double tick therefore never sends twice. A send that fails after the claim is NOT retried: for
 * emails at-most-once is preferred over a duplicate. The loop never ends, locks or takes over a
 * session; handover and overrun only notify. Bookings of resources whose reservations are disabled get
 * no reminders, handover/overrun notices or no-show release; they only complete or expire.
 */
@Injectable()
export class ReservationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ReservationsScheduler');
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private inflight: Promise<void> | null = null;
  /** Bookings that started up to here were already announced to the resource pages. */
  private startsAnnouncedUntil: Date | null = null;
  /** Bookings that start up to here (now + the reader horizon) were already announced to the readers. */
  private readerHorizonAnnouncedUntil: Date | null = null;

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(ReservationStore) private readonly store: ReservationStore,
    @Inject(ReservationService) private readonly reservations: ReservationService,
    @Inject(ResourceSettingsService) private readonly settings: ResourceSettingsService,
    @Inject(ReservationNotifications) private readonly notifications: ReservationNotifications,
    @Inject(RESERVATION_CLOCK) private readonly clock: Clock,
  ) {}

  async onModuleInit(): Promise<void> {
    // Settings drive no-show and reminder rules: start ticking only once the cache is warm.
    await this.settings.whenReady().catch(() => undefined);
    this.start();
  }

  /** Stops the loop and lets a running tick finish before the host closes the database. */
  async onModuleDestroy(): Promise<void> {
    this.stop();
    await this.inflight?.catch(() => undefined);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    this.timer.unref();
    void this.tick(); // catch up right after a restart
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One pass over all steps. Overlapping ticks are skipped; every step is isolated. */
  tick(now: Date = this.clock()): Promise<void> {
    if (this.running) return Promise.resolve();
    this.running = true;
    this.inflight = this.runSteps(now).finally(() => {
      this.running = false;
    });
    return this.inflight;
  }

  private async runSteps(now: Date): Promise<void> {
    const steps: [string, (at: Date) => Promise<void>][] = [
      ['expire pending', (at) => this.expirePending(at)],
      ['no-show', (at) => this.markNoShows(at)],
      ['announce starts', (at) => this.announceStarts(at)],
      ['announce reader horizon', (at) => this.announceReaderHorizon(at)],
      ['complete', (at) => this.completeEnded(at)],
      ['still needed', (at) => this.stillNeeded(at)],
      ['24h reminder', (at) => this.reminder24h(at)],
      ['handover', (at) => this.handover(at)],
      ['overrun', (at) => this.overrun(at)],
    ];
    for (const [name, step] of steps) {
      try {
        await step(now);
      } catch (error) {
        this.logger.error(`scheduler step "${name}" failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private isEnabled(r: ReservationEntity): boolean {
    return this.settings.getCachedSettings(r.resourceId).enabled;
  }

  /** Runs `work` for each item; one failing item does not stop the others. */
  private async each(items: ReservationEntity[], work: (item: ReservationEntity) => Promise<void>): Promise<void> {
    for (const item of items) {
      try {
        await work(item);
      } catch (error) {
        this.logger.error(`reservation ${item.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * A booking that just started blocks other users' starts, which no request announces. Open resource pages
   * learn about it here, within a tick. (Ends are announced when `complete` finishes the booking.)
   */
  private async announceStarts(now: Date): Promise<void> {
    const from = this.startsAnnouncedUntil ?? new Date(now.getTime() - 2 * TICK_INTERVAL_MS);
    const started = await this.store.findUpcomingConfirmed(from, now);
    this.startsAnnouncedUntil = now;
    for (const resourceId of new Set(started.map((r) => r.resourceId))) {
      this.reservations.invalidateViews(resourceId);
    }
  }

  /**
   * A reader shows "Free until" for a booking that starts within 24 h. A booking that just came inside that
   * horizon changes nothing the host knows about (the readers showed nothing), so tell them here.
   */
  private async announceReaderHorizon(now: Date): Promise<void> {
    const horizon = new Date(now.getTime() + READER_HORIZON_MS);
    const from = this.readerHorizonAnnouncedUntil ?? new Date(horizon.getTime() - 2 * TICK_INTERVAL_MS);
    const entering = await this.store.findUpcomingConfirmed(from, horizon);
    this.readerHorizonAnnouncedUntil = horizon;
    for (const resourceId of new Set(entering.map((r) => r.resourceId))) {
      if (this.settings.getCachedSettings(resourceId).enabled) {
        this.reservations.invalidateViews(resourceId, { startBlocked: false });
      }
    }
  }

  private async expirePending(now: Date): Promise<void> {
    await this.each(await this.store.findPendingStarted(now), async (r) => {
      if (!(await this.reservations.markExpired(r.id))) return;
      if (await this.store.claimFlag(r.id, 'expiredNotifiedAt', now)) await this.notifications.notifyExpired(r);
    });
  }

  /**
   * No-show at start + grace with the CURRENT settings. The deadline is capped at the end, and this step
   * runs before completion, so a booking whose grace period reaches its end still becomes a no-show.
   */
  private async markNoShows(now: Date): Promise<void> {
    await this.each(await this.store.findNoShowCandidates(now), async (r) => {
      const settings = this.settings.getCachedSettings(r.resourceId);
      if (!settings.enabled || !settings.checkInEnabled || r.checkedInAt) return;
      const deadline = Math.min(r.startTime.getTime() + settings.checkInGraceMinutes * MINUTE_MS, r.endTime.getTime());
      if (now.getTime() < deadline) return;
      if (await this.checkInRunningSession(r, now)) return;
      if (!(await this.reservations.markNoShow(r.id))) return;
      // After downtime, a booking whose deadline passed long ago still becomes a no-show, but its "slot
      // released" mail would only be noise: claim the flag without sending.
      const late = now.getTime() - deadline > NO_SHOW_NOTICE_WINDOW_MS;
      if ((await this.store.claimFlag(r.id, 'noShowNotifiedAt', now)) && !late)
        await this.notifications.notifyNoShow(r);
    });
  }

  /**
   * Check-in events only fire when a session starts or is taken over. A holder whose session was already
   * running when the booking began (started before the early check-in window, or carried over from their
   * own back-to-back booking) is checked in here, at the no-show deadline, instead of being released.
   * True when such a session runs (the booking must then not become a no-show).
   */
  private async checkInRunningSession(r: ReservationEntity, now: Date): Promise<boolean> {
    const session = (await this.context.resourceAccess.getActiveSessions(r.resourceId)).find(
      (candidate) => candidate.userId === r.userId && candidate.startTime.getTime() < r.endTime.getTime(),
    );
    if (!session) return false;
    await this.reservations.markCheckedIn(r.id, session.usageId, now);
    return true;
  }

  private async completeEnded(now: Date): Promise<void> {
    await this.each(await this.store.findConfirmedEnded(now), async (r) => {
      await this.reservations.markCompleted(r.id);
    });
  }

  /**
   * 48h: only bookings confirmed at least 48h ahead (otherwise the holder just booked, or was just
   * approved, and knows), not when already kept, and only while the start is still more than 24h away
   * (the 24h reminder takes over after that).
   */
  private async stillNeeded(now: Date): Promise<void> {
    const upcoming = await this.store.findUpcomingConfirmed(now, new Date(now.getTime() + STILL_NEEDED_LEAD_MS));
    await this.each(upcoming, async (r) => {
      if (!this.isEnabled(r) || r.keptAt) return;
      const start = r.startTime.getTime();
      if (confirmedAt(r) > start - STILL_NEEDED_LEAD_MS) return;
      if (start - now.getTime() <= REMINDER_LEAD_MS) return;
      if (await this.store.claimFlag(r.id, 'stillNeededSentAt', now)) await this.notifications.notifyStillNeeded(r);
    });
  }

  /** 24h: skipped for bookings confirmed inside that window (their confirmation already carried the rules). */
  private async reminder24h(now: Date): Promise<void> {
    const upcoming = await this.store.findUpcomingConfirmed(now, new Date(now.getTime() + REMINDER_LEAD_MS));
    await this.each(upcoming, async (r) => {
      if (!this.isEnabled(r)) return;
      if (confirmedAt(r) > r.startTime.getTime() - REMINDER_LEAD_MS) return;
      if (await this.store.claimFlag(r.id, 'reminder24hSentAt', now)) await this.notifications.notifyReminder24h(r);
    });
  }

  /** Users with a running session on the resource, other than the holder, shortly before a booking starts. */
  private async handover(now: Date): Promise<void> {
    const widest = Math.max(
      0,
      ...this.settings.getEnabledResourceIds().map((id) => this.settings.getCachedSettings(id).handoverReminderMinutes),
    );
    if (widest === 0) return;
    const upcoming = await this.store.findUpcomingConfirmed(now, new Date(now.getTime() + widest * MINUTE_MS));
    await this.each(upcoming, async (r) => {
      const settings = this.settings.getCachedSettings(r.resourceId);
      const minutes = settings.handoverReminderMinutes;
      if (!settings.enabled || minutes <= 0 || r.startTime.getTime() - now.getTime() > minutes * MINUTE_MS) return;
      const others = (await this.context.resourceAccess.getActiveSessions(r.resourceId)).filter(
        (session) => session.userId !== r.userId,
      );
      // Nothing to say yet: stay unclaimed so a session that starts later inside the window is still told.
      if (others.length === 0) return;
      if (await this.store.claimFlag(r.id, 'handoverSentAt', now)) {
        await this.notifications.notifyHandover(r, [...new Set(others.map((session) => session.userId))]);
      }
    });
  }

  /**
   * A booking started while another user's session (started BEFORE the booking) still runs: tell the
   * holder and that user. Sessions that began during the booking are manager overrides (handled by the
   * session-start event). The session itself is never touched. Only bookings that started within
   * OVERRUN_CHECK_WINDOW_MS are looked at (see there).
   */
  private async overrun(now: Date): Promise<void> {
    const recent = await this.store.findUpcomingConfirmed(new Date(now.getTime() - OVERRUN_CHECK_WINDOW_MS), now);
    await this.each(recent, async (r) => {
      if (!this.isEnabled(r) || r.overrunSentAt || r.endTime.getTime() <= now.getTime()) return;
      const lingering = (await this.context.resourceAccess.getActiveSessions(r.resourceId)).filter(
        (session) => session.userId !== r.userId && session.startTime.getTime() < r.startTime.getTime(),
      );
      if (lingering.length === 0) return;
      if (await this.store.claimFlag(r.id, 'overrunSentAt', now)) {
        await this.notifications.notifyOverrun(r, [...new Set(lingering.map((session) => session.userId))]);
      }
    });
  }
}
