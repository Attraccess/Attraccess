import {
  SystemEvent,
  type PluginContext,
  type SystemEventPayload,
  type SystemEventSubscription,
} from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Clock, PLUGIN_CONTEXT, RESERVATION_CLOCK } from '../constants';
import type { ReservationEntity } from '../entities/reservation.entity';
import { PendingDecisionStore } from '../hooks/pending-decisions';
import { HostInfoService } from '../notifications/host-info.service';
import { ReservationNotifications } from '../notifications/notifier.service';
import { AccessService } from '../reservations/access.service';
import { ReservationService } from '../reservations/reservation.service';
import { ReservationStore } from '../reservations/reservation.store';
import { ResourceSettingsService } from '../settings/resource-settings.service';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Reacts to host events. Subscribed on module init, detached on destroy. Every handler is isolated:
 * a failure is logged and never reaches the host's emitter.
 *
 * Exactly-once notices use the notice ledger (`claimNotice`) BEFORE sending: a restart or a duplicate
 * event never sends twice; a failed send is not retried (at-most-once, see ReservationNotifications).
 */
@Injectable()
export class ReservationEventHandlers implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ReservationsEvents');
  private subscriptions: SystemEventSubscription[] = [];

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(ReservationStore) private readonly store: ReservationStore,
    @Inject(ReservationService) private readonly reservations: ReservationService,
    @Inject(ResourceSettingsService) private readonly settings: ResourceSettingsService,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(ReservationNotifications) private readonly notifications: ReservationNotifications,
    @Inject(HostInfoService) private readonly hostInfo: HostInfoService,
    @Inject(PendingDecisionStore) private readonly decisions: PendingDecisionStore,
    @Inject(RESERVATION_CLOCK) private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.subscribe();
  }

  onModuleDestroy(): void {
    this.unsubscribe();
  }

  subscribe(): void {
    if (this.subscriptions.length > 0) return;
    const on = <E extends SystemEvent>(event: E, handler: (payload: SystemEventPayload[E]) => Promise<void>) =>
      this.context.onEvent(event, async (payload) => {
        try {
          if (!this.settings.isWarm) await this.settings.whenReady();
          await handler(payload);
        } catch (error) {
          this.logger.warn(`${event} handler failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    this.subscriptions = [
      on(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, (p) => this.onSessionStart(p)),
      on(SystemEvent.RESOURCE_USAGE_SESSION_TAKEN_OVER, (p) => this.onSessionStart(p)),
      on(SystemEvent.RESOURCE_USAGE_SESSION_ENDED, (p) => this.onSessionEnded(p)),
      on(SystemEvent.MAINTENANCE_CHANGED, (p) => this.onMaintenance(p)),
      on(SystemEvent.RESOURCE_HEALTH_CHANGED, (p) => this.onHealth(p)),
    ];
  }

  unsubscribe(): void {
    for (const subscription of this.subscriptions) subscription.off();
    this.subscriptions = [];
  }

  // ---------------------------------------------------------------- sessions

  /**
   * A session of `userId` (the requester; for supervised starts the supervisor is only an attribute of
   * the session) started on the resource: record the holder's check-in, or detect a manager override.
   */
  async onSessionStart(event: { resourceId: number; usageId: number; userId: number; startTime: Date }): Promise<void> {
    const { resourceId, usageId, userId, startTime } = event;
    this.decisions.clear(userId, resourceId);
    const settings = this.settings.getCachedSettings(resourceId);
    if (!settings.enabled) return;

    const candidate = await this.store.findCheckInCandidate(
      userId,
      resourceId,
      startTime,
      settings.earlyCheckInMinutes,
    );
    if (candidate) await this.reservations.markCheckedIn(candidate.id, usageId, startTime);

    const active = (await this.store.findActiveForResource(resourceId, startTime)).find((r) => r.userId !== userId);
    if (!active) return;
    // Only a manager can start during someone else's booking (via the override confirmation).
    if (!(await this.access.isManager(userId, resourceId))) return;
    if (!(await this.store.claimNotice(active.id, 'override_start', String(usageId), this.clock()))) return;
    await this.reservations.auditLog.record(
      'override_start',
      { userId, authenticationMethod: 'session' },
      { type: 'reservation', id: active.id },
      { resourceId, holderUserId: active.userId, byManager: true },
    );
    await this.notifications.notifyOverrideStart(active, userId);
  }

  /** The holder stopped a session in their own running booking: remember the keep/free question. */
  async onSessionEnded(event: SystemEventPayload[SystemEvent.RESOURCE_USAGE_SESSION_ENDED]): Promise<void> {
    if (event.reason !== 'ended') return;
    if (!this.settings.getCachedSettings(event.resourceId).enabled) return;
    const now = this.clock();
    const own = (await this.store.findActiveForResource(event.resourceId, now)).find((r) => r.userId === event.userId);
    if (own) this.decisions.record(event.userId, event.resourceId, own.id, now.getTime());
  }

  // ------------------------------------------------------------- maintenance

  /** Notifies holders of bookings overlapping the maintenance window, once per (booking, maintenance). */
  async onMaintenance(event: SystemEventPayload[SystemEvent.MAINTENANCE_CHANGED]): Promise<void> {
    if (event.action === 'finished') return;
    const overlapping = await this.store.findLiveOverlapping(event.resourceId, event.startTime, event.endTime);
    for (const reservation of overlapping) {
      await this.once(reservation, 'maintenance', String(event.maintenanceId), () =>
        this.notifications.notifyMaintenance(
          reservation,
          { startTime: event.startTime, endTime: event.endTime, reason: null },
          event.maintenanceId,
        ),
      );
    }
  }

  // ------------------------------------------------------------------ health

  /**
   * Health notices. An outage is identified by the clock hour it was announced in: unhealthy notices use
   * the ref key `h<hour bucket>`, so duplicate deliveries inside one hour collapse while a later outage
   * (a different hour) notifies again. Recovery answers the unhealthy notices of the booking: it reuses
   * their ref key, so exactly the holders that were told get told once, and only when no health entry of
   * the resource is unhealthy anymore.
   */
  async onHealth(event: SystemEventPayload[SystemEvent.RESOURCE_HEALTH_CHANGED]): Promise<void> {
    const now = this.clock();
    if (event.status === 'unhealthy') {
      const affected = await this.store.findLiveOverlapping(event.resourceId, now, new Date(now.getTime() + DAY_MS));
      const key = `h${Math.floor(now.getTime() / HOUR_MS)}`;
      for (const reservation of affected) {
        await this.once(reservation, 'health_unhealthy', key, () =>
          this.notifications.notifyHealth(reservation, 'unhealthy', event.reason),
        );
      }
      return;
    }
    if (event.status !== 'healthy' || event.previousStatus !== 'unhealthy') return;
    if ((await this.hostInfo.countUnhealthyEntries(event.resourceId)) > 0) return;
    const live = await this.store.findLiveOverlapping(event.resourceId, now, null);
    const told = await this.store.findNotices(
      live.map((r) => r.id),
      'health_unhealthy',
    );
    for (const reservation of live) {
      const outages = told.filter((notice) => notice.reservationId === reservation.id).map((notice) => notice.refKey);
      let claimed = false;
      for (const outage of outages) {
        claimed = (await this.store.claimNotice(reservation.id, 'health_recovered', outage, now)) || claimed;
      }
      if (claimed) await this.notifications.notifyHealth(reservation, 'recovered', null);
    }
  }

  /** Claims the notice and, only for the call that inserted it, sends. */
  private async once(
    reservation: ReservationEntity,
    kind: string,
    refKey: string,
    send: () => Promise<boolean>,
  ): Promise<void> {
    if (!(await this.store.claimNotice(reservation.id, kind, refKey, this.clock()))) return;
    await send();
  }
}
