import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Clock, PLUGIN_CONTEXT, RESERVATION_CLOCK } from '../constants';
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
 * session; handover and overrun only notify.
 */
@Injectable()
export class ReservationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ReservationsScheduler');
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private inflight: Promise<void> | null = null;

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

  private async expirePending(now: Date): Promise<void> {
    await this.each(await this.store.findPendingStarted(now), async (r) => {
      if (!(await this.reservations.markExpired(r.id))) return;
      if (await this.store.claimFlag(r.id, 'expiredNotifiedAt', now)) await this.notifications.notifyExpired(r);
    });
  }

  private async markNoShows(now: Date): Promise<void> {
    await this.each(await this.store.findConfirmedStartedNotEnded(now), async (r) => {
      const settings = this.settings.getCachedSettings(r.resourceId);
      if (!settings.enabled || !settings.checkInEnabled || r.checkedInAt) return;
      if (now.getTime() < r.startTime.getTime() + settings.checkInGraceMinutes * MINUTE_MS) return;
      if (!(await this.reservations.markNoShow(r.id))) return;
      if (await this.store.claimFlag(r.id, 'noShowNotifiedAt', now)) await this.notifications.notifyNoShow(r);
    });
  }

  private async completeEnded(now: Date): Promise<void> {
    await this.each(await this.store.findConfirmedEnded(now), async (r) => {
      await this.reservations.markCompleted(r.id);
    });
  }

  /**
   * 48h: only bookings made at least 48h ahead (otherwise the holder just booked and knows), and only
   * while the start is still more than 24h away (the 24h reminder takes over after that).
   */
  private async stillNeeded(now: Date): Promise<void> {
    const upcoming = await this.store.findUpcomingConfirmed(now, new Date(now.getTime() + STILL_NEEDED_LEAD_MS));
    await this.each(upcoming, async (r) => {
      const start = r.startTime.getTime();
      if (r.createdAt.getTime() > start - STILL_NEEDED_LEAD_MS) return;
      if (start - now.getTime() <= REMINDER_LEAD_MS || r.keptAt) return;
      if (await this.store.claimFlag(r.id, 'stillNeededSentAt', now)) await this.notifications.notifyStillNeeded(r);
    });
  }

  /** 24h: skipped for bookings made inside that window (their confirmation already carried the rules). */
  private async reminder24h(now: Date): Promise<void> {
    const upcoming = await this.store.findUpcomingConfirmed(now, new Date(now.getTime() + REMINDER_LEAD_MS));
    await this.each(upcoming, async (r) => {
      if (r.createdAt.getTime() > r.startTime.getTime() - REMINDER_LEAD_MS) return;
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
      const minutes = this.settings.getCachedSettings(r.resourceId).handoverReminderMinutes;
      if (minutes <= 0 || r.startTime.getTime() - now.getTime() > minutes * MINUTE_MS) return;
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
   * session-start event). The session itself is never touched.
   */
  private async overrun(now: Date): Promise<void> {
    await this.each(await this.store.findConfirmedStartedNotEnded(now), async (r) => {
      if (r.overrunSentAt) return;
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
