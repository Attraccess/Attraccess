import type { PreStartContext, PreStartResult } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { Clock, RESERVATION_CLOCK } from '../constants';
import type { ReservationEntity } from '../entities/reservation.entity';
import { formatTime, pick } from '../notifications/format';
import { AccessService } from '../reservations/access.service';
import { DirectoryService } from '../reservations/directory.service';
import { ReservationStore } from '../reservations/reservation.store';
import { GlobalSettingsService } from '../settings/global-settings.service';
import { ResourceSettingsService } from '../settings/resource-settings.service';

const ALLOW: PreStartResult = Object.freeze({ decision: 'allow' }) as PreStartResult;
const MINUTE_MS = 60_000;
export const WARM_BUDGET_MS = 700;

export const reservationStepKey = (id: number) => `reservation-${id}`;
export const overrideStepKey = (id: number) => `override-${id}`;

/**
 * Pre-start gate. Hot path of every session start, so:
 * - resources without reservations are answered from the in-memory settings cache (no database access);
 * - enabled resources cost exactly one indexed query (confirmed bookings overlapping [now, now + window]);
 * - permission checks and name lookups only run when a conflicting booking of someone else exists.
 * Only confirmed bookings of OTHER users count; pending, cancelled, no-show, expired and ended-early
 * (completed) bookings never block or ask.
 */
@Injectable()
export class PreStartService {
  constructor(
    @Inject(ResourceSettingsService) private readonly settings: ResourceSettingsService,
    @Inject(GlobalSettingsService) private readonly globalSettings: GlobalSettingsService,
    @Inject(ReservationStore) private readonly store: ReservationStore,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(DirectoryService) private readonly directory: DirectoryService,
    @Inject(RESERVATION_CLOCK) private readonly clock: Clock,
  ) {}

  /** Before the cache is warm a resource may still be enabled: wait briefly, never wrongly allow. */
  private async awaitWarmCache(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Reservation settings are not loaded yet')), WARM_BUDGET_MS);
    });
    try {
      await Promise.race([this.settings.whenReady(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async evaluate(ctx: PreStartContext): Promise<PreStartResult> {
    if (!this.settings.isWarm) await this.awaitWarmCache();
    const settings = this.settings.getCachedSettings(ctx.resourceId);
    if (!settings.enabled) return ALLOW;

    const now = ctx.now ?? this.clock();
    // +1 ms so a booking starting exactly now counts as running even with a confirm window of 0.
    const horizon = new Date(now.getTime() + settings.confirmWindowMinutes * MINUTE_MS + 1);
    const others = (await this.store.findConfirmedOverlapping(ctx.resourceId, now, horizon)).filter(
      (reservation) => reservation.userId !== ctx.userId,
    );
    if (others.length === 0) return ALLOW;

    const nowMs = now.getTime();
    const active = others.find((r) => r.startTime.getTime() <= nowMs);
    if (active) return this.whenActive(ctx, active);

    const upcoming = others[0]; // ordered by start: the next one
    if (ctx.confirmedStepKeys.includes(reservationStepKey(upcoming.id))) return ALLOW;
    const timeZone = await this.globalSettings.getTimezone();
    const { language: lang } = ctx;
    const minutes = Math.max(1, Math.ceil((upcoming.startTime.getTime() - nowMs) / MINUTE_MS));
    const from = formatTime(upcoming.startTime, { lang, timeZone });
    return {
      decision: 'confirm',
      confirmation: {
        stepKey: reservationStepKey(upcoming.id),
        title: pick(lang, 'Reserved soon', 'Bald reserviert'),
        body: pick(
          lang,
          `Reserved from ${from}, you have ${minutes} min. Start anyway?`,
          `Reserviert ab ${from}, du hast ${minutes} Min. Trotzdem starten?`,
        ),
        tone: 'warning',
        confirmLabel: pick(lang, 'Start anyway', 'Trotzdem starten'),
        cancelLabel: pick(lang, 'Cancel', 'Abbrechen'),
        countdownTo: upcoming.startTime,
        noScreenPolicy: 'block',
      },
    };
  }

  private async whenActive(ctx: PreStartContext, active: ReservationEntity): Promise<PreStartResult> {
    const { language: lang } = ctx;
    const isManager = await this.access.isManager(ctx.userId, ctx.resourceId);
    if (isManager && ctx.confirmedStepKeys.includes(overrideStepKey(active.id))) return ALLOW;
    const timeZone = await this.globalSettings.getTimezone();
    const until = formatTime(active.endTime, { lang, timeZone });
    if (!isManager) {
      return {
        decision: 'block',
        reason: {
          code: 'RESERVED',
          title: pick(lang, 'Reserved', 'Reserviert'),
          // The holder is never named to a non-manager.
          body: pick(
            lang,
            `Reserved by another user until ${until}.`,
            `Von einer anderen Person bis ${until} reserviert.`,
          ),
        },
      };
    }
    const name =
      (await this.directory.getUserNames([active.userId])).get(active.userId) ??
      pick(lang, 'another user', 'einer anderen Person');
    return {
      decision: 'confirm',
      confirmation: {
        stepKey: overrideStepKey(active.id),
        title: pick(lang, 'Reserved', 'Reserviert'),
        body: pick(
          lang,
          `Reserved by ${name} until ${until}. Start anyway?`,
          `Von ${name} bis ${until} reserviert. Trotzdem starten?`,
        ),
        tone: 'danger',
        confirmLabel: pick(lang, 'Start anyway', 'Trotzdem starten'),
        cancelLabel: pick(lang, 'Cancel', 'Abbrechen'),
        noScreenPolicy: 'block',
      },
    };
  }
}
