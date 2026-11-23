import { Injectable, Logger, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../../notifications/notification-types';
import { createTranslator } from '../../../i18n/translate';
import { ResourceUsageService } from '../sessions/resource-usage.service';
import * as en from './session-duration.en.json';
import * as de from './session-duration.de.json';
import { SESSION_DEADLINE_STORE, SessionDeadlineStore } from './session-deadline-store.port';
import { ENDING_SOON_OFFSETS_MINUTES, MINUTE_MS } from './session-duration.rules';

const t = createTranslator({ en, de });
const BATCH = 100;

/**
 * Ends sessions that reached their deadline and warns their owners shortly before. Every API instance runs it; the
 * store's conditional updates and the machine's session-change turns make each end and each warning happen once.
 * A session that became overdue while the API was down ends on the first run after start-up.
 */
@Injectable()
export class SessionAutoEndService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SessionAutoEndService.name);
  private running = false;

  constructor(
    private readonly usage: ResourceUsageService,
    private readonly notifications: NotificationDispatchService,
    @Inject(SESSION_DEADLINE_STORE) private readonly deadlines: SessionDeadlineStore,
  ) {}

  onApplicationBootstrap(): void {
    void this.run();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async run(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.endOverdueSessions(now);
      await this.sendEndingSoonWarnings(now);
    } catch (error) {
      this.logger.error(`Automatic session end run failed: ${(error as Error).message}`, (error as Error).stack);
    } finally {
      this.running = false;
    }
  }

  async endOverdueSessions(now: Date): Promise<number> {
    let ended = 0;
    // Failing sessions stay overdue; remember them so one broken session cannot starve the rest of the batch.
    const failed = new Set<number>();
    for (;;) {
      const overdue = (await this.deadlines.findOverdue(now, BATCH + failed.size)).filter(
        (session) => !failed.has(session.id),
      );
      if (overdue.length === 0) return ended;
      for (const session of overdue) {
        try {
          if (await this.usage.endSessionAutomatically(session.resourceId, session.id)) ended += 1;
        } catch (error) {
          failed.add(session.id);
          this.logger.warn(
            `Ending session ${session.id} of resource ${session.resourceId} automatically failed: ${(error as Error).message}`,
          );
        }
      }
      // Ended sessions left the overdue list; stop once a pass changed nothing.
      if (overdue.every((session) => failed.has(session.id))) return ended;
    }
  }

  /** Sends the smallest due offset only: a run that was late for the 15 minute warning does not also send the 5. */
  async sendEndingSoonWarnings(now: Date): Promise<void> {
    const largest = Math.max(...ENDING_SOON_OFFSETS_MINUTES);
    for (const session of await this.deadlines.findEndingWithin(now, largest)) {
      if (!session.autoEndAt || !session.user || !session.resource) continue;
      const remainingMinutes = (session.autoEndAt.getTime() - now.getTime()) / MINUTE_MS;
      const offset = Math.min(...ENDING_SOON_OFFSETS_MINUTES.filter((candidate) => remainingMinutes <= candidate));
      if (!Number.isFinite(offset)) continue;
      const sent = session.autoEndWarnedOffsetMinutes;
      if (sent !== null && sent <= offset) continue;
      if (!(await this.deadlines.claimWarning(session.id, session.autoEndAt, offset))) continue;

      const { user: recipient, resource } = session;
      const endsAt = session.autoEndAt;
      const minutes = Math.max(1, Math.ceil(remainingMinutes));
      await this.notifications
        .dispatch({
          category: NotificationCategory.RESOURCE_SESSION_ENDING_SOON,
          recipients: [recipient],
          title: (r) => t(r.locale, 'endingSoonTitle', { resourceName: resource.name }),
          body: (r) => t(r.locale, 'endingSoonBody', { minutes }),
          url: `/resources/${resource.id}`,
          severity: 'warning',
          dedupeKey: `resource_session_ending_soon:${session.id}:${endsAt.getTime()}:${offset}`,
          sendEmail: (r) =>
            this.notifications.sendEmailTemplate(r, NotificationCategory.RESOURCE_SESSION_ENDING_SOON, {
              resource: { id: resource.id, name: resource.name },
              session: { id: session.id, endsAt, minutesLeft: minutes },
            }),
        })
        .catch((error: unknown) =>
          this.logger.warn(`Ending-soon notification for session ${session.id} failed: ${(error as Error).message}`),
        );
    }
  }
}
