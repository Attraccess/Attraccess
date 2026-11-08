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
import { VisibilityService } from '../ical/visibility.service';
import { formatTime, pick } from '../notifications/format';
import { readerName, readerTime } from '../reader-ui/texts';
import { AccessService } from '../reservations/access.service';
import { type AccessSubject, subjectOfPrincipal } from '../reservations/actor';
import { DirectoryService } from '../reservations/directory.service';
import { ReservationStore } from '../reservations/reservation.store';
import { GlobalSettingsService } from '../settings/global-settings.service';
import { ResourceSettingsService } from '../settings/resource-settings.service';
import { hookDeadline, waitUntil } from './runtime';

const ALLOW: PreStartResult = Object.freeze({ decision: 'allow' }) as PreStartResult;
const MINUTE_MS = 60_000;
/** Longer names are cut, so the reason stays within the host's text limit and is never refused as invalid. */
const MAX_HOLDER_NAME_CHARS = 40;

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
    @Inject(VisibilityService) private readonly visibility: VisibilityService,
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
      const verdict = await this.whenActive(ctx, active, now);
      if (verdict) return verdict;
    }

    // Ordered by start: the next booking not confirmed yet.
    const upcoming = others.find(
      (r) => r.startTime.getTime() > nowMs && !ctx.confirmedStepKeys.includes(reservationStepKey(r.id)),
    );
    if (!upcoming) return ALLOW;
    const { language: lang } = ctx;
    const minutes = Math.max(1, Math.ceil((upcoming.startTime.getTime() - nowMs) / MINUTE_MS));
    const from = await this.timeText(ctx, upcoming.startTime, now);
    const holder = await this.holderForReader(ctx, upcoming);
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
   * checks again at start, so this is informational and uses the same answer as the gate, including who is named.
   * Like the plugin's own endpoints it says nothing about resources the viewer may not see (hidden groups).
   */
  async evaluateStartBlocked(ctx: StartBlockedContext, deadline = hookDeadline()): Promise<StartBlockedState | null> {
    if (!this.settings.isWarm) {
      await waitUntil(this.settings.whenReady(), deadline, 'Reservation settings are not loaded yet');
    }
    if (!this.settings.getCachedSettings(ctx.resourceId).enabled) return null;
    const now = ctx.now ?? this.clock();
    const active = (await this.store.findActiveForResource(ctx.resourceId, now)).find((r) => r.userId !== ctx.userId);
    if (!active) return null;
    // The viewer's request scope (an API token's) applies to every check, as in core's own answers.
    const viewer = subjectOfPrincipal(ctx.principal);
    if (await this.access.isManager(viewer, ctx.resourceId)) return null;
    if ((await this.visibility.filterVisible(viewer, [ctx.resourceId])).length === 0) return null;
    const timeZone = await this.globalSettings.getTimezone();
    const holder = await this.holderNameFor(viewer, active);
    const until = formatTime(active.endTime, { lang: ctx.language, timeZone });
    return { reason: reservedReason(ctx.language, until, holder), until: active.endTime };
  }

  /**
   * The booking holder's name for a viewer who may see who uses the machine (core's usage attribution rule, the
   * same one that decides who sees the current user of a running session); null for everyone else.
   */
  private async holderNameFor(viewer: AccessSubject, booking: ReservationEntity): Promise<string | null> {
    if (!(await this.access.attributionResourceIds(viewer, [booking.resourceId])).has(booking.resourceId)) return null;
    return shorten((await this.directory.getUserNames([booking.userId])).get(booking.userId) ?? null);
  }

  /**
   * The holder's name in the "starts soon" question on a reader: for managers of the resource and for viewers who
   * may see who uses the machine (core's usage attribution rule, as in {@link holderNameFor}), shortened for the
   * reader. Starts are made by an identified user, so this is always "after the card tap". Web and API starts keep
   * the nameless ATT-881 question (no lookup).
   */
  private async holderForReader(ctx: PreStartContext, booking: ReservationEntity): Promise<string | undefined> {
    if (ctx.origin !== 'reader') return undefined;
    const name = (await this.access.isManager(subjectOfPrincipal(ctx.principal), ctx.resourceId))
      ? (await this.directory.getUserNames([booking.userId])).get(booking.userId)
      : await this.holderNameFor(subjectOfPrincipal(ctx.principal), booking);
    return name ? readerName(name) || undefined : undefined;
  }

  /** A time in a start text: readers follow the reader rule (weekday on another local day), web and API keep `HH:MM`. */
  private async timeText(ctx: PreStartContext, date: Date, now: Date): Promise<string> {
    const timeZone = await this.globalSettings.getTimezone();
    const { language: lang } = ctx;
    return ctx.origin === 'reader' ? readerTime(date, { lang, timeZone, now }) : formatTime(date, { lang, timeZone });
  }

  /** Block for non-managers; for managers the next unconfirmed override, or null when all are confirmed. */
  private async whenActive(
    ctx: PreStartContext,
    active: ReservationEntity[],
    now: Date,
  ): Promise<PreStartResult | null> {
    const { language: lang } = ctx;
    // The starter's request scope applies: a token without `resources.update` gets no manager override.
    const starter = subjectOfPrincipal(ctx.principal);
    const isManager = await this.access.isManager(starter, ctx.resourceId);
    const unconfirmed = isManager
      ? active.find((r) => !ctx.confirmedStepKeys.includes(overrideStepKey(r.id)))
      : active[0];
    if (!unconfirmed) return null;
    const until = await this.timeText(ctx, unconfirmed.endTime, now);
    if (!isManager) {
      const found = await this.holderNameFor(subjectOfPrincipal(ctx.principal), unconfirmed);
      const holder = found && ctx.origin === 'reader' ? readerName(found) : found;
      return { decision: 'block', reason: reservedReason(lang, until, holder) };
    }
    // Managers always see the holder; only a reader needs the short, Latin-1 form of the name.
    const found = shorten((await this.directory.getUserNames([unconfirmed.userId])).get(unconfirmed.userId) ?? null);
    const shown = found !== null && ctx.origin === 'reader' ? readerName(found) : found;
    const name = shown || pick(lang, 'another user', 'einer anderen Person');
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

function shorten(name: string | null): string | null {
  const chars = name === null ? [] : Array.from(name);
  return chars.length > MAX_HOLDER_NAME_CHARS ? `${chars.slice(0, MAX_HOLDER_NAME_CHARS - 1).join('')}…` : name;
}

/**
 * Reason shown to a user who may not start during someone else's booking. The holder is named only when the viewer
 * may see who uses the machine (`holder` is then set), otherwise the text stays anonymous.
 */
function reservedReason(lang: 'en' | 'de', until: string, holder: string | null | undefined): PluginBlockReason {
  return {
    code: 'RESERVED',
    title: pick(lang, 'Reserved', 'Reserviert'),
    body: holder
      ? pick(lang, `Reserved by ${holder} until ${until}.`, `Von ${holder} bis ${until} reserviert.`)
      : pick(lang, `Reserved by another user until ${until}.`, `Von einer anderen Person bis ${until} reserviert.`),
  };
}
