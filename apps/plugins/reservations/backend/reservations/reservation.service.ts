import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock, PLUGIN_CONTEXT, RESERVATION_CLOCK, RESERVATION_NOTIFIER } from '../constants';
import { ReservationEntity, ReservationStatus } from '../entities/reservation.entity';
import { ResourceSettingsService } from '../settings/resource-settings.service';
import { GlobalSettingsService } from '../settings/global-settings.service';
import { AccessService } from './access.service';
import { ReservationAudit } from './audit';
import { DirectoryService } from './directory.service';
import { ReservationError } from './errors';
import { KeyedMutex } from './mutex';
import type { ReservationNotifier } from './notifier';
import { ReservationStore } from './reservation.store';
import { blockedSpan, checkBookingRules, spansOverlap } from './rules';

export const MAX_TEXT_LENGTH = 500;
export const DISABLED_REASON = 'reservations disabled';

export interface CreateReservationInput {
  resourceId: number;
  startTime: Date;
  endTime: Date;
  note?: string | null;
}

export function cleanText(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim().slice(0, MAX_TEXT_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

/** Commands on reservations: create, cancel, end early, keep, approve/reject and scheduler transitions. */
@Injectable()
export class ReservationService {
  private readonly logger = new Logger('Reservations');
  private readonly mutex = new KeyedMutex();
  private readonly audit: ReservationAudit;

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(ReservationStore) private readonly store: ReservationStore,
    @Inject(ResourceSettingsService) private readonly settings: ResourceSettingsService,
    @Inject(GlobalSettingsService) private readonly globalSettings: GlobalSettingsService,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(DirectoryService) private readonly directory: DirectoryService,
    @Inject(RESERVATION_NOTIFIER) private readonly notifier: ReservationNotifier,
    @Inject(RESERVATION_CLOCK) private readonly clock: Clock,
  ) {
    this.audit = new ReservationAudit(context.audit, this.logger);
  }

  /** Audit writer shared with settings/feed code and part 2 (override_start, no_show, ...). */
  get auditLog(): ReservationAudit {
    return this.audit;
  }

  private async notify(label: string, send: () => Promise<void> | void): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.logger.warn(`notifier ${label} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ---------------------------------------------------------------- create

  /**
   * Creates a booking. Creation is serialised per resource (in-process mutex + host serialized
   * transaction), so of N concurrent overlapping requests exactly one succeeds. Throws a typed
   * `ReservationError` (409 with `{ code, message }`) for every violated rule.
   */
  async create(actor: PluginAuditPrincipal, input: CreateReservationInput): Promise<ReservationEntity> {
    const resource = await this.directory.getResource(input.resourceId);
    if (!resource) throw new ReservationError('RESOURCE_NOT_FOUND', 'Resource not found');
    const created = await this.mutex.run(input.resourceId, async () => {
      const settings = await this.settings.get(input.resourceId);
      const canBook = await this.access.canBook(actor.userId, input.resourceId, settings);
      if (!canBook.allowed && canBook.reason) {
        throw new ReservationError(
          canBook.reason,
          canBook.reason === 'RESERVATIONS_DISABLED'
            ? 'Reservations are disabled for this resource'
            : 'You are not allowed to book this resource',
        );
      }
      const now = this.clock();
      const timeZone = await this.globalSettings.getTimezone();
      const violation = checkBookingRules({ settings, timeZone, start: input.startTime, end: input.endTime, now });
      if (violation) throw violation;
      const span = blockedSpan({
        startTime: input.startTime,
        endTime: input.endTime,
        bufferBeforeMinutes: settings.bufferBeforeMinutes,
        bufferAfterMinutes: settings.bufferAfterMinutes,
      });
      const maintenance = await this.context.resourceAccess.getMaintenanceWindows(
        input.resourceId,
        span.start,
        span.end,
      );
      if (maintenance.length > 0) {
        throw new ReservationError('MAINTENANCE', 'The resource is in maintenance during this time');
      }
      return this.context.runSerialized(async (manager) => {
        if (settings.maxActiveBookingsPerUser > 0) {
          const live = await this.store.countLiveForUser(manager, actor.userId, input.resourceId, now);
          if (live >= settings.maxActiveBookingsPerUser) {
            throw new ReservationError(
              'USER_BOOKING_LIMIT',
              `You can have at most ${settings.maxActiveBookingsPerUser} active bookings for this resource`,
            );
          }
        }
        const candidates = await this.store.findOverlapCandidates(manager, input.resourceId, span.start, span.end);
        if (candidates.some((other) => spansOverlap(span, blockedSpan(other)))) {
          throw new ReservationError('OVERLAP', 'The time is already reserved');
        }
        const entity = new ReservationEntity();
        Object.assign(entity, {
          resourceId: input.resourceId,
          userId: actor.userId,
          startTime: input.startTime,
          endTime: input.endTime,
          bufferBeforeMinutes: settings.bufferBeforeMinutes,
          bufferAfterMinutes: settings.bufferAfterMinutes,
          status: settings.approvalRequired ? 'pending' : 'confirmed',
          note: cleanText(input.note),
          createdAt: now,
        } satisfies Partial<ReservationEntity>);
        return manager.getRepository(ReservationEntity).save(entity);
      });
    });
    await this.audit.record(
      'created',
      actor,
      { type: 'reservation', id: created.id },
      {
        resourceId: created.resourceId,
        holderUserId: created.userId,
      },
    );
    if (created.status === 'pending') await this.notify('onPending', () => this.notifier.onPending(created));
    else await this.notify('onConfirmed', () => this.notifier.onConfirmed(created, { viaApproval: false }));
    return created;
  }

  // ----------------------------------------------------- holder / manager

  private async load(id: number): Promise<ReservationEntity> {
    const reservation = await this.store.findById(id);
    if (!reservation) throw new ReservationError('RESERVATION_NOT_FOUND', 'Reservation not found');
    return reservation;
  }

  /** Loads a reservation for an actor: non-holders that do not manage the resource get a 404. */
  async getForActor(
    actor: PluginAuditPrincipal,
    id: number,
  ): Promise<{ reservation: ReservationEntity; isHolder: boolean; isManager: boolean }> {
    const reservation = await this.load(id);
    const isHolder = reservation.userId === actor.userId;
    const isManager = await this.access.isManager(actor.userId, reservation.resourceId);
    if (!isHolder && !isManager) throw new ReservationError('RESERVATION_NOT_FOUND', 'Reservation not found');
    return { reservation, isHolder, isManager };
  }

  async cancel(actor: PluginAuditPrincipal, id: number, reason?: string | null): Promise<ReservationEntity> {
    const { reservation, isHolder, isManager } = await this.getForActor(actor, id);
    const now = this.clock();
    const live = reservation.status === 'pending' || reservation.status === 'confirmed';
    if (!live || reservation.endTime.getTime() <= now.getTime()) {
      throw new ReservationError('NOT_CANCELLABLE', 'This reservation can no longer be cancelled');
    }
    if (reservation.status === 'confirmed' && reservation.startTime.getTime() <= now.getTime()) {
      throw new ReservationError('ALREADY_STARTED', 'The reservation is running; end it early instead');
    }
    const cleaned = cleanText(reason);
    const changed = await this.store.transition(id, [reservation.status], {
      status: 'cancelled',
      cancelledBy: actor.userId,
      cancelReason: cleaned,
    });
    if (!changed) throw new ReservationError('NOT_CANCELLABLE', 'This reservation can no longer be cancelled');
    const updated = await this.load(id);
    await this.audit.record(
      'cancelled',
      actor,
      { type: 'reservation', id },
      {
        resourceId: updated.resourceId,
        holderUserId: updated.userId,
        byManager: !isHolder && isManager,
        reason: cleaned,
      },
    );
    await this.notify('onCancelled', () =>
      this.notifier.onCancelled(updated, { byUserId: actor.userId, byHolder: isHolder }),
    );
    return updated;
  }

  /** Ends an active booking now (endTime = now) and frees the slot. Holder or manager. */
  async endEarly(actor: PluginAuditPrincipal, id: number): Promise<ReservationEntity> {
    const { reservation, isHolder, isManager } = await this.getForActor(actor, id);
    const now = this.clock();
    const active =
      reservation.status === 'confirmed' &&
      reservation.startTime.getTime() <= now.getTime() &&
      now.getTime() < reservation.endTime.getTime();
    if (!active) throw new ReservationError('NOT_ACTIVE', 'Only a running reservation can be ended early');
    const changed = await this.store.transition(id, ['confirmed'], {
      status: 'completed',
      endTime: now,
      endedEarlyAt: now,
    });
    if (!changed) throw new ReservationError('NOT_ACTIVE', 'Only a running reservation can be ended early');
    const updated = await this.load(id);
    await this.audit.record(
      'ended_early',
      actor,
      { type: 'reservation', id },
      {
        resourceId: updated.resourceId,
        holderUserId: updated.userId,
        byManager: !isHolder && isManager,
      },
    );
    await this.notify('onEndedEarly', () => this.notifier.onEndedEarly(updated, { byUserId: actor.userId }));
    return updated;
  }

  /** Holder keeps the booking ("still needed" answer / keep the rest after stopping). Idempotent. */
  async keep(actor: PluginAuditPrincipal, id: number): Promise<ReservationEntity> {
    const reservation = await this.load(id);
    if (reservation.userId !== actor.userId)
      throw new ReservationError('RESERVATION_NOT_FOUND', 'Reservation not found');
    const live = reservation.status === 'pending' || reservation.status === 'confirmed';
    if (!live || reservation.endTime.getTime() <= this.clock().getTime()) {
      throw new ReservationError('ALREADY_FINISHED', 'This reservation is no longer active');
    }
    if (!reservation.keptAt) await this.store.transition(id, [reservation.status], { keptAt: this.clock() });
    return this.load(id);
  }

  // -------------------------------------------------------------- approval

  async approve(actor: PluginAuditPrincipal, id: number, reason?: string | null): Promise<ReservationEntity> {
    return this.decide(actor, id, 'confirmed', reason);
  }

  async reject(actor: PluginAuditPrincipal, id: number, reason?: string | null): Promise<ReservationEntity> {
    return this.decide(actor, id, 'rejected', reason);
  }

  private async decide(
    actor: PluginAuditPrincipal,
    id: number,
    target: 'confirmed' | 'rejected',
    reason?: string | null,
  ): Promise<ReservationEntity> {
    const reservation = await this.load(id);
    if (!(await this.access.isManager(actor.userId, reservation.resourceId))) {
      throw new ReservationError('FORBIDDEN', 'Only managers of this resource can decide on bookings');
    }
    if (reservation.status !== 'pending')
      throw new ReservationError('NOT_PENDING', 'The reservation is not waiting for approval');
    if (reservation.startTime.getTime() <= this.clock().getTime()) {
      throw new ReservationError('ALREADY_STARTED', 'The reservation already started and can no longer be decided');
    }
    const cleaned = cleanText(reason);
    const changed = await this.store.transition(id, ['pending'], {
      status: target,
      decidedBy: actor.userId,
      decisionReason: cleaned,
      decidedAt: this.clock(),
    });
    if (!changed) throw new ReservationError('NOT_PENDING', 'The reservation is not waiting for approval');
    const updated = await this.load(id);
    await this.audit.record(
      target === 'confirmed' ? 'approved' : 'rejected',
      actor,
      { type: 'reservation', id },
      {
        resourceId: updated.resourceId,
        holderUserId: updated.userId,
        reason: cleaned,
      },
    );
    if (target === 'confirmed')
      await this.notify('onConfirmed', () => this.notifier.onConfirmed(updated, { viaApproval: true }));
    else await this.notify('onRejected', () => this.notifier.onRejected(updated));
    return updated;
  }

  // -------------------------------------------------- disabling a resource

  async countFutureBookings(resourceId: number): Promise<number> {
    return (await this.store.findFutureLive(resourceId, this.clock())).length;
  }

  /** Cancels every future pending/confirmed booking of the resource (reason `reservations disabled`). */
  async cancelFutureBookings(actor: PluginAuditPrincipal, resourceId: number): Promise<number> {
    const future = await this.store.findFutureLive(resourceId, this.clock());
    let cancelled = 0;
    for (const reservation of future) {
      const changed = await this.store.transition(reservation.id, ['pending', 'confirmed'], {
        status: 'cancelled',
        cancelledBy: actor.userId,
        cancelReason: DISABLED_REASON,
      });
      if (!changed) continue;
      cancelled += 1;
      const updated = await this.load(reservation.id);
      await this.audit.record(
        'cancelled',
        actor,
        { type: 'reservation', id: updated.id },
        {
          resourceId,
          holderUserId: updated.userId,
          byManager: updated.userId !== actor.userId,
          reason: DISABLED_REASON,
          bulk: true,
        },
      );
      await this.notify('onRemoved', () =>
        this.notifier.onRemoved(updated, { byUserId: actor.userId, reason: DISABLED_REASON }),
      );
    }
    return cancelled;
  }

  // ------------------------------------------- scheduler / hook transitions

  private async system(
    id: number,
    from: ReservationStatus[],
    changes: Partial<ReservationEntity>,
    action: 'no_show' | 'expired' | null,
  ): Promise<boolean> {
    const changed = await this.store.transition(id, from, changes);
    if (changed && action) {
      const updated = await this.load(id);
      await this.audit.record(
        action,
        ReservationAudit.systemPrincipal(updated.userId),
        { type: 'reservation', id },
        {
          resourceId: updated.resourceId,
          holderUserId: updated.userId,
        },
      );
    }
    return changed;
  }

  /** confirmed -> no_show. True only for the call that made the transition (send the holder email then). */
  markNoShow(id: number): Promise<boolean> {
    return this.system(id, ['confirmed'], { status: 'no_show' }, 'no_show');
  }

  /** pending -> expired (still pending at start). True only for the call that made the transition. */
  markExpired(id: number): Promise<boolean> {
    return this.system(id, ['pending'], { status: 'expired' }, 'expired');
  }

  /** confirmed -> completed after the end time passed. */
  markCompleted(id: number): Promise<boolean> {
    return this.system(id, ['confirmed'], { status: 'completed' }, null);
  }

  /** Holder started a session inside the check-in window. True when this call recorded the check-in. */
  async markCheckedIn(id: number, usageId: number, at: Date): Promise<boolean> {
    const result = await this.context
      .getRepository(ReservationEntity)
      .createQueryBuilder()
      .update(ReservationEntity)
      .set({ checkedInAt: at, checkedInUsageId: usageId })
      .where("id = :id AND status = 'confirmed' AND checkedInAt IS NULL", { id })
      .execute();
    return (result.affected ?? 0) === 1;
  }
}
