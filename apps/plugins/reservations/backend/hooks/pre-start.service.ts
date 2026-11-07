import type {
  PluginBlockReason,
  PreStartContext,
  PreStartResult,
  StartBlockedContext,
  StartBlockedState,
} from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { Clock, RESERVATION_CLOCK } from '../constants';
import type { ReservationEntity } from '../entities/reservation.entity';
import { formatTime, pick } from '../notifications/format';
import { readerName } from '../reader-ui/texts';
import { AccessService } from '../reservations/access.service';
import { DirectoryService } from '../reservations/directory.service';
import { ReservationStore } from '../reservations/reservation.store';
import { GlobalSettingsService } from '../settings/global-settings.service';
import { ResourceSettingsService } from '../settings/resource-settings.service';
import type { ResourceSettings } from '../settings/settings.model';
import { hookDeadline, waitUntil } from './runtime';

const ALLOW: PreStartResult = Object.freeze({ decision: 'allow' }) as PreStartResult;
const MINUTE_MS = 60_000;

export const reservationStepKey = (id: number) => `reservation-${id}`;
export const overrideStepKey = (id: number) => `override-${id}`;

/**
 * Pre-start gate. Hot path of every session start, so:
 * - resources without reservations are answered from the in-memory settings cache (no database access);
 * - enabled resources cost exactly one indexed query (confirmed bookings overlapping [now, now + window]);
 * - permission checks and name lookups only run when a conflicting booking of someone else exists.
 * Only confirmed bookings of OTHER users count; pending, cancelled, no-show, expired and ended-early
 * (completed) bookings never block or ask. Every booking that applies is asked about in turn: a
 * confirmation only covers its own step key, so the next unconfirmed booking is asked on the retry.
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

  /**
   * `deadline` (epoch ms) bounds the wait for a cold settings cache: before it is warm a resource may
   * still be enabled, so never wrongly allow; past the deadline this throws and the host policy applies.
   */
  async evaluate(ctx: PreStartContext, deadline = hookDeadline()): Promise<PreStartResult> {
    if (!this.settings.isWarm) {
      await waitUntil(this.settings.whenReady(), deadline, 'Reservation settings are not loaded yet');
    }
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
    const active = others.filter((r) => r.startTime.getTime() <= nowMs);
    if (active.length > 0) {
      const verdict = await this.whenActive(ctx, active, settings);
      if (verdict) return verdict;
    }

    // Ordered by start: the next booking not confirmed yet.
    const upcoming = others.find(
      (r) => r.startTime.getTime() > nowMs && !ctx.confirmedStepKeys.includes(reservationStepKey(r.id)),
    );
    if (!upcoming) return ALLOW;
    const timeZone = await this.globalSettings.getTimezone();
    const { language: lang } = ctx;
    const minutes = Math.max(1, Math.ceil((upcoming.startTime.getTime() - nowMs) / MINUTE_MS));
    const from = formatTime(upcoming.startTime, { lang, timeZone });
    const holder = await this.holderForReader(ctx, settings, upcoming);
    return {
      decision: 'confirm',
      confirmation: {
        stepKey: reservationStepKey(upcoming.id),
        title: pick(lang, 'Reserved soon', 'Bald reserviert'),
        body: holder
          ? pick(
              lang,
              `Reserved by ${holder} from ${from}, you have ${minutes} min. Start anyway?`,
              `Reserviert von ${holder} ab ${from}, du hast ${minutes} Min. Trotzdem starten?`,
            )
          : pick(
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

  /**
   * The UI counterpart of the block in {@link whenActive}: a booking of another user is running now and the
   * viewer may not override it. Managers see nothing (they start through the override confirmation), and
   * a booking that merely starts soon is not a block (it is only a confirmation at start). The host
   * checks again at start, so this is informational and uses the same answer as the gate.
   */
  async evaluateStartBlocked(ctx: StartBlockedContext, deadline = hookDeadline()): Promise<StartBlockedState | null> {
    if (!this.settings.isWarm) {
      await waitUntil(this.settings.whenReady(), deadline, 'Reservation settings are not loaded yet');
    }
    if (!this.settings.getCachedSettings(ctx.resourceId).enabled) return null;
    const now = ctx.now ?? this.clock();
    const active = (await this.store.findActiveForResource(ctx.resourceId, now)).find((r) => r.userId !== ctx.userId);
    if (!active) return null;
    if (await this.access.isManager(ctx.userId, ctx.resourceId)) return null;
    const timeZone = await this.globalSettings.getTimezone();
    return { reason: reservedReason(ctx.language, active.endTime, timeZone), until: active.endTime };
  }

  /**
   * The holder's name for a start made on a reader, when the starter may see it: a manager of the resource,
   * or anybody when the resource opted in (`showNamesOnReaders`). Starts are made by an identified user, so
   * this is always "after the card tap". Web and API starts keep their texts (no name lookup, no change).
   * `checkManager: false` skips the manager lookup (the caller already knows the starter is not one).
   */
  private async holderForReader(
    ctx: PreStartContext,
    settings: ResourceSettings,
    booking: ReservationEntity,
    checkManager = true,
  ): Promise<string | undefined> {
    if (ctx.origin !== 'reader') return undefined;
    const allowed =
      settings.showNamesOnReaders || (checkManager && (await this.access.isManager(ctx.userId, ctx.resourceId)));
    if (!allowed) return undefined;
    const name = (await this.directory.getUserNames([booking.userId])).get(booking.userId);
    return name ? readerName(name) : undefined;
  }

  /** Block for non-managers; for managers the next unconfirmed override, or null when all are confirmed. */
  private async whenActive(
    ctx: PreStartContext,
    active: ReservationEntity[],
    settings: ResourceSettings,
  ): Promise<PreStartResult | null> {
    const { language: lang } = ctx;
    const isManager = await this.access.isManager(ctx.userId, ctx.resourceId);
    const unconfirmed = isManager
      ? active.find((r) => !ctx.confirmedStepKeys.includes(overrideStepKey(r.id)))
      : active[0];
    if (!unconfirmed) return null;
    const timeZone = await this.globalSettings.getTimezone();
    const until = formatTime(unconfirmed.endTime, { lang, timeZone });
    if (!isManager) {
      const holder = await this.holderForReader(ctx, settings, unconfirmed, false);
      return { decision: 'block', reason: reservedReason(lang, unconfirmed.endTime, timeZone, holder) };
    }
    const name = readerName(
      (await this.directory.getUserNames([unconfirmed.userId])).get(unconfirmed.userId) ??
        pick(lang, 'another user', 'einer anderen Person'),
    );
    return {
      decision: 'confirm',
      confirmation: {
        stepKey: overrideStepKey(unconfirmed.id),
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

/** Reason shown to a user who may not start during someone else's booking. The holder is named only when `holder` is set. */
function reservedReason(lang: 'en' | 'de', endTime: Date, timeZone: string, holder?: string): PluginBlockReason {
  const until = formatTime(endTime, { lang, timeZone });
  return {
    code: 'RESERVED',
    title: pick(lang, 'Reserved', 'Reserviert'),
    body: holder
      ? pick(lang, `Reserved by ${holder} until ${until}.`, `Von ${holder} bis ${until} reserviert.`)
      : pick(lang, `Reserved by another user until ${until}.`, `Von einer anderen Person bis ${until} reserviert.`),
  };
}
