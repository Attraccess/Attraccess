import type { PluginContext, PluginTransactionScope } from '@attraccess/plugins-backend-sdk';
import { PluginStorageUniqueViolation } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { PLUGIN_CONTEXT } from '../constants';
import { tablesOf } from '../storage';
import type { NoticeRow } from '../storage/notice-table';
import {
  REMINDER_FLAGS,
  type ReminderFlag,
  type ReservationRow,
  type ReservationStatus,
  type ReservationWhere,
} from '../storage/reservation-table';

/** Largest buffer a resource may configure; bounds the candidate query for buffer-aware overlap. */
export const MAX_BUFFER_MINUTES = 1440;

/** Statuses of a booking that still occupies its slot. */
const LIVE: ReservationStatus[] = ['pending', 'confirmed'];

export interface ManagedListFilter {
  /** `null` = all resources, otherwise restrict to these ids. */
  resourceIds: number[] | null;
  status?: ReservationStatus;
  from?: Date;
  to?: Date;
  skip: number;
  take: number;
}

/**
 * Persistence for reservations. Per-resource reads use the (resourceId, status, startTime, endTime)
 * index; the scheduler's cross-resource scans use (status, startTime) and (status, endTime). State transitions are
 * conditional updates (compare-and-set) and return whether THIS call changed the row, which is what makes double
 * ticks / concurrent requests idempotent.
 */
@Injectable()
export class ReservationStore {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  private get tables() {
    return tablesOf(this.context);
  }

  private get reservations() {
    return this.tables.reservations;
  }

  private find(
    where: ReservationWhere,
    options: { limit?: number; desc?: boolean; scope?: PluginTransactionScope } = {},
  ) {
    return this.reservations.find(
      { where, orderBy: [{ field: 'startTime', direction: options.desc ? 'desc' : 'asc' }], limit: options.limit },
      { scope: options.scope },
    ) as Promise<ReservationRow[]>;
  }

  async findById(id: number): Promise<ReservationRow | null> {
    return (await this.reservations.get(id)) as ReservationRow | null;
  }

  /** Confirmed bookings of the resource that end after `from` and start before `to` (hook hot path). */
  findConfirmedOverlapping(resourceId: number, from: Date, to: Date): Promise<ReservationRow[]> {
    return this.find({ resourceId, status: 'confirmed', endTime: { gt: from }, startTime: { lt: to } });
  }

  /** Confirmed bookings running at `now` ([start, end)). */
  findActiveForResource(resourceId: number, now: Date): Promise<ReservationRow[]> {
    return this.find({ resourceId, status: 'confirmed', startTime: { lte: now }, endTime: { gt: now } });
  }

  /** Confirmed bookings starting in (from, to] across all resources (reminders, handover, overrun). */
  findUpcomingConfirmed(from: Date, to: Date): Promise<ReservationRow[]> {
    return this.find({ status: 'confirmed', startTime: { gt: from, lte: to } });
  }

  /**
   * Confirmed bookings that started and have no check-in yet (no-show step). Ended ones are included on
   * purpose: a grace period reaching the end must still end in no_show, not in completed.
   */
  findNoShowCandidates(now: Date): Promise<ReservationRow[]> {
    return this.find({ status: 'confirmed', startTime: { lte: now }, checkedInAt: null });
  }

  /** Confirmed bookings whose end has passed (to be marked completed). */
  findConfirmedEnded(now: Date): Promise<ReservationRow[]> {
    return this.find({ status: 'confirmed', endTime: { lte: now } });
  }

  /** Pending bookings whose start has passed (to be expired). */
  findPendingStarted(now: Date): Promise<ReservationRow[]> {
    return this.find({ status: 'pending', startTime: { lte: now } });
  }

  /** The holder's confirmed, not yet checked-in booking whose check-in window contains `now`. */
  async findCheckInCandidate(
    userId: number,
    resourceId: number,
    now: Date,
    earlyCheckInMinutes: number,
  ): Promise<ReservationRow | null> {
    const windowStart = new Date(now.getTime() + earlyCheckInMinutes * 60_000);
    const [first] = await this.find(
      {
        resourceId,
        userId,
        status: 'confirmed',
        checkedInAt: null,
        startTime: { lte: windowStart },
        endTime: { gt: now },
      },
      { limit: 1 },
    );
    return first ?? null;
  }

  /** The holder's confirmed, not yet checked-in bookings overlapping [from, to) (a session that ran in them). */
  findUncheckedOverlapping(userId: number, resourceId: number, from: Date, to: Date): Promise<ReservationRow[]> {
    return this.find({
      resourceId,
      userId,
      status: 'confirmed',
      checkedInAt: null,
      startTime: { lt: to },
      endTime: { gt: from },
    });
  }

  /** Pending + confirmed bookings of the resource overlapping [from, to) (maintenance/health notices). */
  findLiveOverlapping(resourceId: number, from: Date, to: Date | null): Promise<ReservationRow[]> {
    return this.find({
      resourceId,
      status: { in: LIVE },
      endTime: { gt: from },
      ...(to ? { startTime: { lt: to } } : {}),
    });
  }

  /**
   * Candidates for buffer-aware overlap checks (pending + confirmed), exact filtering is done by the caller. Read
   * through the scope of the booking transaction.
   */
  findOverlapCandidates(
    scope: PluginTransactionScope | undefined,
    resourceId: number,
    from: Date,
    to: Date,
  ): Promise<ReservationRow[]> {
    return this.find(
      {
        resourceId,
        status: { in: LIVE },
        startTime: { lt: new Date(to.getTime() + MAX_BUFFER_MINUTES * 60_000) },
        endTime: { gt: new Date(from.getTime() - MAX_BUFFER_MINUTES * 60_000) },
      },
      { scope },
    );
  }

  /** Confirmed bookings running at `now` ([start, end)), read through the host's start transaction (capacity hook). */
  findRunningConfirmed(scope: PluginTransactionScope, resourceId: number, now: Date): Promise<ReservationRow[]> {
    return this.find({ resourceId, status: 'confirmed', startTime: { lte: now }, endTime: { gt: now } }, { scope });
  }

  /**
   * Pending + confirmed bookings of the resource whose buffer-aware span can still matter at or after `now`
   * (the capacity reconciliation after a lowered limit).
   */
  findOccupyingFrom(resourceId: number, now: Date): Promise<ReservationRow[]> {
    return this.findLiveOverlapping(resourceId, new Date(now.getTime() - MAX_BUFFER_MINUTES * 60_000), null);
  }

  countLiveForUser(
    scope: PluginTransactionScope | undefined,
    userId: number,
    resourceId: number,
    now: Date,
  ): Promise<number> {
    return this.reservations.count({ userId, resourceId, status: { in: LIVE }, endTime: { gt: now } }, { scope });
  }

  /** Number of pending/confirmed bookings of the resource starting after `now` (a COUNT, no rows loaded). */
  countFutureLive(resourceId: number, now: Date): Promise<number> {
    return this.reservations.count({ resourceId, status: { in: LIVE }, startTime: { gt: now } });
  }

  /**
   * Applies `changes` to every pending/confirmed booking of the resource starting after `now`, in one
   * transaction (select + one update with the same predicate), and returns the changed rows.
   */
  cancelFutureLive(resourceId: number, now: Date, changes: Partial<ReservationRow>): Promise<ReservationRow[]> {
    const where = { resourceId, status: { in: LIVE }, startTime: { gt: now } };
    return this.context.persistence.transaction(async (scope) => {
      const rows = await this.find(where, { scope });
      if (rows.length === 0) return [];
      await this.reservations.update(where, changes, { scope });
      return rows.map((row) => Object.assign(row, changes));
    });
  }

  /** Bookings an iCal feed shows (pending, confirmed, ended) in [from, to), optionally only one holder's. */
  findForCalendar(resourceIds: number[], from: Date, to: Date, userId?: number): Promise<ReservationRow[]> {
    if (resourceIds.length === 0) return Promise.resolve([]);
    return this.find(
      {
        resourceId: { in: resourceIds },
        status: { in: ['pending', 'confirmed', 'completed'] },
        endTime: { gt: from },
        startTime: { lt: to },
        ...(userId !== undefined ? { userId } : {}),
      },
      { limit: 5000 },
    );
  }

  /** Occupying bookings (pending + confirmed) overlapping [from, to) for availability views. */
  findOccupying(resourceId: number, from: Date, to: Date): Promise<ReservationRow[]> {
    return this.findLiveOverlapping(resourceId, from, to);
  }

  listForUser(
    userId: number,
    scope: 'upcoming' | 'past',
    now: Date,
    status?: ReservationStatus,
  ): Promise<ReservationRow[]> {
    const mine: ReservationWhere[] =
      scope === 'upcoming'
        ? [{ userId, status: { in: LIVE }, endTime: { gt: now } }]
        : [{ userId }, { or: [{ status: { notIn: LIVE } }, { endTime: { lte: now } }] }];
    return this.find({ and: [...mine, ...(status ? [{ status }] : [])] }, { limit: 200, desc: scope === 'past' });
  }

  async listManaged(filter: ManagedListFilter): Promise<{ items: ReservationRow[]; total: number }> {
    if (filter.resourceIds && filter.resourceIds.length === 0) return { items: [], total: 0 };
    const where: ReservationWhere = {
      ...(filter.resourceIds ? { resourceId: { in: filter.resourceIds } } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.from ? { endTime: { gt: filter.from } } : {}),
      ...(filter.to ? { startTime: { lt: filter.to } } : {}),
    };
    const [items, total] = await Promise.all([
      this.reservations.find({
        where,
        orderBy: [{ field: 'startTime', direction: 'desc' }],
        limit: filter.take,
        offset: filter.skip,
      }) as Promise<ReservationRow[]>,
      this.reservations.count(where),
    ]);
    return { items, total };
  }

  /**
   * Conditional status transition; true when this call moved the row out of one of `from`. With
   * `notCheckedIn` the row must also still lack a check-in (no-show must lose against a check-in that
   * was saved after the scheduler loaded the row).
   */
  async transition(
    id: number,
    from: ReservationStatus[],
    changes: Partial<ReservationRow>,
    options: { notCheckedIn?: boolean } = {},
  ): Promise<boolean> {
    const affected = await this.reservations.update(
      { id, status: { in: from }, ...(options.notCheckedIn ? { checkedInAt: null } : {}) },
      changes,
    );
    return affected === 1;
  }

  /**
   * Claims a one-shot notification flag: sets `flag = at` where `id = ? AND flag IS NULL` (compare-and-set).
   * Only the caller that gets `true` may send. Combine with the send inside the same transaction (pass its
   * `scope`) when the send can roll the claim back.
   */
  async claimFlag(id: number, flag: ReminderFlag, at: Date, scope?: PluginTransactionScope): Promise<boolean> {
    if (!REMINDER_FLAGS.includes(flag)) throw new Error(`Unknown reminder flag ${String(flag)}`);
    const affected = await this.reservations.update(
      { id, [flag]: null } as ReservationWhere,
      { [flag]: at },
      { scope },
    );
    return affected === 1;
  }

  /**
   * Exactly-once notice claim for (reservation, kind, refKey): true when this call inserted the row,
   * false when it already existed.
   */
  async claimNotice(
    reservationId: number,
    kind: string,
    refKey: string,
    at: Date,
    scope?: PluginTransactionScope,
  ): Promise<boolean> {
    try {
      await this.tables.notices.insert({ reservationId, kind, refKey, sentAt: at }, { scope });
      return true;
    } catch (error) {
      if (error instanceof PluginStorageUniqueViolation) return false;
      throw error;
    }
  }

  /** Notices of the given kind already claimed for these reservations. */
  async findNotices(reservationIds: number[], kind: string): Promise<NoticeRow[]> {
    if (reservationIds.length === 0) return [];
    return this.tables.notices.find({ where: { kind, reservationId: { in: reservationIds } } });
  }

  /** Release a notice claim (when the send failed and should be retried next tick). */
  async releaseNotice(reservationId: number, kind: string, refKey: string): Promise<void> {
    await this.tables.notices.delete({ reservationId, kind, refKey });
  }
}
