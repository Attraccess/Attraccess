import type { SessionEndContext, SessionEndResult } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock, RESERVATION_CLOCK } from '../constants';
import { formatTime, pick } from '../notifications/format';
import { readerTime } from '../reader-ui/texts';
import { ReservationAudit } from '../reservations/audit';
import { ReservationError } from '../reservations/errors';
import { ReservationService } from '../reservations/reservation.service';
import { ReservationStore } from '../reservations/reservation.store';
import { GlobalSettingsService } from '../settings/global-settings.service';
import { ResourceSettingsService } from '../settings/resource-settings.service';
import { PendingDecisionStore } from './pending-decisions';
import { hookDeadline, waitUntil } from './runtime';

const NONE: SessionEndResult = Object.freeze({ decision: 'none' }) as SessionEndResult;

/**
 * Session-end hook: when the holder stops a session inside their own running booking, ask whether to
 * keep the rest or free it. Readers show the question; web/API stops apply the default (`keep`)
 * immediately, and the plugin's resource page asks through the pending-decision endpoint instead.
 */
@Injectable()
export class SessionEndService {
  private readonly logger = new Logger('ReservationsSessionEnd');

  constructor(
    @Inject(ResourceSettingsService) private readonly settings: ResourceSettingsService,
    @Inject(GlobalSettingsService) private readonly globalSettings: GlobalSettingsService,
    @Inject(ReservationStore) private readonly store: ReservationStore,
    @Inject(ReservationService) private readonly reservations: ReservationService,
    @Inject(PendingDecisionStore) private readonly decisions: PendingDecisionStore,
    @Inject(RESERVATION_CLOCK) private readonly clock: Clock,
  ) {}

  /** `deadline` (epoch ms) bounds the wait for the settings cache; past it this throws (host policy applies). */
  async evaluate(ctx: SessionEndContext, deadline = hookDeadline()): Promise<SessionEndResult> {
    if (!this.settings.isWarm) {
      await waitUntil(this.settings.whenReady(), deadline, 'Reservation settings are not loaded yet');
    }
    if (!this.settings.getCachedSettings(ctx.resourceId).enabled) return NONE;
    const now = ctx.now ?? this.clock();
    const own = (await this.store.findActiveForResource(ctx.resourceId, now)).find((r) => r.userId === ctx.userId);
    if (!own) return NONE;

    const { language: lang } = ctx;
    const timeZone = await this.globalSettings.getTimezone();
    // A reader writes a time on another local day with its weekday, like the reader slots.
    const until =
      ctx.origin === 'reader'
        ? readerTime(own.endTime, { lang, timeZone, now })
        : formatTime(own.endTime, { lang, timeZone });
    const principal = ReservationAudit.systemPrincipal(ctx.userId);
    return {
      decision: 'choose',
      choice: {
        stepKey: `keepfree-${own.id}`,
        title: pick(lang, 'Keep your booking?', 'Reservierung behalten?'),
        body: pick(
          lang,
          `Your booking runs until ${until}. Keep it or free the rest?`,
          `Deine Reservierung läuft bis ${until}. Behalten oder den Rest freigeben?`,
        ),
        choices: [
          { id: 'keep', label: pick(lang, 'Keep', 'Behalten') },
          { id: 'free', label: pick(lang, 'Free rest', 'Rest freigeben') },
        ],
        defaultOnTimeout: 'keep',
        expiresInSec: 15,
        onAnswer: async (choiceId: string) => {
          try {
            if (choiceId === 'free') {
              await this.reservations.endEarly(principal, own.id);
              this.decisions.clear(ctx.userId, ctx.resourceId);
            } else {
              await this.reservations.keep(principal, own.id);
              // A reader asked in place: that answer is final. A web/API stop applies the default
              // right away, so its question must survive for the resource page.
              if (ctx.origin === 'reader')
                this.decisions.clearAndSuppress(ctx.userId, ctx.resourceId, this.clock().getTime());
            }
          } catch (error) {
            // The booking may have ended or been cancelled in the meantime.
            if (error instanceof ReservationError) return;
            this.logger.warn(`keep/free answer failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        },
      },
    };
  }
}
