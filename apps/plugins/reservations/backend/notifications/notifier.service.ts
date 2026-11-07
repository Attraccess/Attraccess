import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock, PLUGIN_CONTEXT, RESERVATION_CLOCK } from '../constants';
import type { ReservationEntity } from '../entities/reservation.entity';
import { DirectoryService } from '../reservations/directory.service';
import type { ReservationNotifier } from '../reservations/notifier';
import { ReservationStore } from '../reservations/reservation.store';
import { GlobalSettingsService } from '../settings/global-settings.service';
import { ResourceSettingsService } from '../settings/resource-settings.service';
import { NoticeText, renderNotice } from './format';
import { HostInfoService } from './host-info.service';
import * as lifecycle from './messages';
import * as ops from './messages-ops';
import type { MessageContext } from './messages';
import type { MaintenanceSpan } from './messages-ops';

/** Notification categories declared in `PluginBackendModule.notificationCategories`. */
export const NOTIFICATION_CATEGORIES = [
  { id: 'bookings', label: { en: 'Reservations: my bookings', de: 'Reservierungen: meine Buchungen' } },
  { id: 'approvals', label: { en: 'Reservations: approvals', de: 'Reservierungen: Genehmigungen' } },
  { id: 'reminders', label: { en: 'Reservations: reminders', de: 'Reservierungen: Erinnerungen' } },
  { id: 'availability', label: { en: 'Reservations: availability', de: 'Reservierungen: Verfügbarkeit' } },
  { id: 'handover', label: { en: 'Reservations: handover', de: 'Reservierungen: Übergabe' } },
  { id: 'overrides', label: { en: 'Reservations: overrides', de: 'Reservierungen: Starts trotz Reservierung' } },
] as const;
export type NotificationCategoryId = (typeof NOTIFICATION_CATEGORIES)[number]['id'];

/**
 * Sends every notification of the plugin through `context.notifications.dispatch`. Texts are built per
 * recipient language (the host takes one title/body per call, so recipients are grouped by language),
 * times are written in the plugin timezone, and each mail carries {subject, text, html}.
 *
 * Delivery is at-most-once by design: callers claim their persisted flag/notice BEFORE sending, and a
 * failed dispatch is logged and reported as `false` but never retried, so a flaky mail server cannot
 * cause duplicate mails. Notifications never throw into the booking flow.
 */
@Injectable()
export class ReservationNotifications implements ReservationNotifier {
  private readonly logger = new Logger('ReservationsNotifications');

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(HostInfoService) private readonly hostInfo: HostInfoService,
    @Inject(DirectoryService) private readonly directory: DirectoryService,
    @Inject(GlobalSettingsService) private readonly globalSettings: GlobalSettingsService,
    @Inject(ResourceSettingsService) private readonly settings: ResourceSettingsService,
    @Inject(ReservationStore) private readonly store: ReservationStore,
    @Inject(RESERVATION_CLOCK) private readonly clock: Clock,
  ) {}

  /** Dispatches one notice to the recipients in their languages. True when every dispatch succeeded. */
  async send(
    category: NotificationCategoryId,
    resourceId: number,
    recipientIds: number[],
    dedupeKey: string,
    build: (m: MessageContext) => NoticeText,
  ): Promise<boolean> {
    const recipients = [...new Set(recipientIds)];
    if (recipients.length === 0) return false;
    try {
      const [resource, timeZone, baseUrl, languages] = await Promise.all([
        this.directory.getResource(resourceId),
        this.globalSettings.getTimezone(),
        this.hostInfo.getBaseUrl(),
        this.hostInfo.languagesOf(recipients),
      ]);
      const resourceName = resource?.name ?? `#${resourceId}`;
      const byLanguage = new Map<'en' | 'de', number[]>();
      for (const id of recipients) {
        const lang = languages.get(id) ?? 'en';
        byLanguage.set(lang, [...(byLanguage.get(lang) ?? []), id]);
      }
      for (const [lang, ids] of byLanguage) {
        const rendered = renderNotice(build({ lang, timeZone, resourceName }), baseUrl);
        await this.context.notifications.dispatch({
          category,
          recipients: ids,
          title: rendered.title,
          body: rendered.body,
          url: rendered.url,
          severity: rendered.severity,
          dedupeKey,
          email: rendered.email,
        });
      }
      return true;
    } catch (error) {
      this.logger.warn(`notification ${dedupeKey} failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private async holderName(userId: number): Promise<string> {
    return (await this.directory.getUserNames([userId])).get(userId) ?? `#${userId}`;
  }

  private async managersExcept(resourceId: number, ...excluded: number[]): Promise<number[]> {
    return (await this.hostInfo.managerIdsOf(resourceId)).filter((id) => !excluded.includes(id));
  }

  // ------------------------------------------------ ReservationNotifier

  async onPending(r: ReservationEntity): Promise<void> {
    const [managers, holder] = await Promise.all([
      this.managersExcept(r.resourceId, r.userId),
      this.holderName(r.userId),
    ]);
    await this.send('approvals', r.resourceId, managers, `reservations:pending:${r.id}`, (m) =>
      lifecycle.pendingForManagers(m, r, holder),
    );
  }

  async onConfirmed(r: ReservationEntity, context: { viaApproval: boolean }): Promise<void> {
    // At-most-once: the claim comes first, so a retry or a double call never sends a second mail.
    if (!(await this.store.claimFlag(r.id, 'confirmationSentAt', this.clock()))) return;
    const settings = this.settings.getCachedSettings(r.resourceId);
    await this.send(
      context.viaApproval ? 'approvals' : 'bookings',
      r.resourceId,
      [r.userId],
      `reservations:confirmed:${r.id}`,
      (m) => lifecycle.confirmed(m, r, settings, context.viaApproval),
    );
  }

  async onRejected(r: ReservationEntity): Promise<void> {
    await this.send('approvals', r.resourceId, [r.userId], `reservations:rejected:${r.id}`, (m) =>
      lifecycle.rejected(m, r),
    );
  }

  async onCancelled(r: ReservationEntity, context: { byUserId: number; byHolder: boolean }): Promise<void> {
    if (context.byHolder) return;
    await this.send('bookings', r.resourceId, [r.userId], `reservations:cancelled:${r.id}`, (m) =>
      lifecycle.cancelledByManager(m, r),
    );
  }

  async onEndedEarly(r: ReservationEntity, context: { byUserId: number }): Promise<void> {
    if (context.byUserId === r.userId) return;
    await this.send('bookings', r.resourceId, [r.userId], `reservations:ended:${r.id}`, (m) =>
      lifecycle.endedEarlyByManager(m, r),
    );
  }

  async onRemoved(r: ReservationEntity, context: { byUserId: number }): Promise<void> {
    if (context.byUserId === r.userId) return;
    await this.send('bookings', r.resourceId, [r.userId], `reservations:removed:${r.id}`, (m) =>
      lifecycle.removed(m, r),
    );
  }

  // ------------------------------------- scheduler / event notifications

  notifyExpired(r: ReservationEntity): Promise<boolean> {
    return this.send('approvals', r.resourceId, [r.userId], `reservations:expired:${r.id}`, (m) =>
      lifecycle.expired(m, r),
    );
  }

  notifyNoShow(r: ReservationEntity): Promise<boolean> {
    const settings = this.settings.getCachedSettings(r.resourceId);
    return this.send('bookings', r.resourceId, [r.userId], `reservations:no-show:${r.id}`, (m) =>
      lifecycle.noShow(m, r, settings),
    );
  }

  notifyStillNeeded(r: ReservationEntity): Promise<boolean> {
    return this.send('reminders', r.resourceId, [r.userId], `reservations:still-needed:${r.id}`, (m) =>
      ops.stillNeeded(m, r),
    );
  }

  notifyReminder24h(r: ReservationEntity): Promise<boolean> {
    const settings = this.settings.getCachedSettings(r.resourceId);
    return this.send('reminders', r.resourceId, [r.userId], `reservations:reminder-24h:${r.id}`, (m) =>
      ops.reminder24h(m, r, settings),
    );
  }

  notifyMaintenance(r: ReservationEntity, window: MaintenanceSpan, maintenanceId: number): Promise<boolean> {
    return this.send(
      'availability',
      r.resourceId,
      [r.userId],
      `reservations:maintenance:${r.id}:${maintenanceId}`,
      (m) => ops.maintenanceAffected(m, r, window),
    );
  }

  notifyHealth(r: ReservationEntity, kind: 'unhealthy' | 'recovered', reason: string | null): Promise<boolean> {
    return this.send('availability', r.resourceId, [r.userId], `reservations:health-${kind}:${r.id}`, (m) =>
      kind === 'unhealthy' ? ops.healthUnhealthy(m, r, reason) : ops.healthRecovered(m, r),
    );
  }

  notifyHandover(r: ReservationEntity, sessionUserIds: number[]): Promise<boolean> {
    return this.send('handover', r.resourceId, sessionUserIds, `reservations:handover:${r.id}`, (m) =>
      ops.handover(m, r.startTime),
    );
  }

  /** Overrun: tells the holder and the user whose session still runs. Never touches the session. */
  async notifyOverrun(r: ReservationEntity, sessionUserIds: number[]): Promise<boolean> {
    const holder = await this.send('handover', r.resourceId, [r.userId], `reservations:overrun:${r.id}`, (m) =>
      ops.overrunForHolder(m, r),
    );
    const user = await this.send('handover', r.resourceId, sessionUserIds, `reservations:overrun-user:${r.id}`, (m) =>
      ops.overrunForUser(m, r),
    );
    return holder || user;
  }

  /** A manager started the resource during the holder's booking: holder and the other managers. */
  async notifyOverrideStart(r: ReservationEntity, starterId: number): Promise<boolean> {
    const [names, managers] = await Promise.all([
      this.directory.getUserNames([starterId, r.userId]),
      this.managersExcept(r.resourceId, starterId, r.userId),
    ]);
    const starter = names.get(starterId) ?? `#${starterId}`;
    const holder = names.get(r.userId) ?? `#${r.userId}`;
    const toHolder = await this.send('overrides', r.resourceId, [r.userId], `reservations:override:${r.id}`, (m) =>
      ops.overrideForHolder(m, r, starter),
    );
    const toManagers = await this.send('overrides', r.resourceId, managers, `reservations:override-mgr:${r.id}`, (m) =>
      ops.overrideForManagers(m, r, starter, holder),
    );
    return toHolder || toManagers;
  }
}
