import { ResourceUsage, ResourceUsageAction } from '@attraccess/plugins-backend-sdk';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { PLUGIN_CONTEXT } from '../constants';
import { NoticeEntity } from '../entities/notice.entity';
import { REMINDER_FLAGS, ReminderFlag, ReservationEntity, ReservationStatus } from '../entities/reservation.entity';

/** Largest buffer a resource may configure; bounds the candidate query for buffer-aware overlap. */
export const MAX_BUFFER_MINUTES = 1440;

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
 * index; the scheduler's cross-resource scans use (status, startTime) and (status, endTime). State transitions are conditional UPDATEs and return whether THIS call changed the row, which is what
 * makes double ticks / concurrent requests idempotent.
 */
@Injectable()
export class ReservationStore {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  private get repo() {
    return this.context.getRepository(ReservationEntity);
  }

  findById(id: number): Promise<ReservationEntity | null> {
    return this.repo.findOneBy({ id });
  }

  /** Confirmed bookings of the resource that end after `from` and start before `to` (hook hot path). */
  findConfirmedOverlapping(resourceId: number, from: Date, to: Date): Promise<ReservationEntity[]> {
    return this.repo
      .createQueryBuilder('r')
      .where('r.resourceId = :resourceId AND r.status = :status', { resourceId, status: 'confirmed' })
      .andWhere('r.endTime > :from AND r.startTime < :to', { from, to })
      .orderBy('r.startTime', 'ASC')
      .getMany();
  }

  /** Confirmed bookings running at `now` ([start, end)). */
  findActiveForResource(resourceId: number, now: Date): Promise<ReservationEntity[]> {
    return this.repo
      .createQueryBuilder('r')
      .where('r.resourceId = :resourceId AND r.status = :status', { resourceId, status: 'confirmed' })
      .andWhere('r.startTime <= :now AND r.endTime > :now', { now })
      .orderBy('r.startTime', 'ASC')
      .getMany();
  }

  /** Confirmed bookings starting in (from, to] across all resources (reminders, handover, overrun). */
  findUpcomingConfirmed(from: Date, to: Date): Promise<ReservationEntity[]> {
    return this.repo
      .createQueryBuilder('r')
      .where('r.status = :status AND r.startTime > :from AND r.startTime <= :to', { status: 'confirmed', from, to })
      .orderBy('r.startTime', 'ASC')
      .getMany();
  }

  /**
   * Confirmed bookings that started and have no check-in yet (no-show step). Ended ones are included on
   * purpose: a grace period reaching the end must still end in no_show, not in completed.
   */
  findNoShowCandidates(now: Date): Promise<ReservationEntity[]> {
    return this.repo
      .createQueryBuilder('r')
      .where('r.status = :status AND r.startTime <= :now AND r.checkedInAt IS NULL', { status: 'confirmed', now })
      .getMany();
  }

  /** Confirmed bookings whose end has passed (to be marked completed). */
  findConfirmedEnded(now: Date): Promise<ReservationEntity[]> {
    return this.repo
      .createQueryBuilder('r')
      .where('r.status = :status AND r.endTime <= :now', { status: 'confirmed', now })
      .getMany();
  }

  /** Pending bookings whose start has passed (to be expired). */
  findPendingStarted(now: Date): Promise<ReservationEntity[]> {
    return this.repo
      .createQueryBuilder('r')
      .where('r.status = :status AND r.startTime <= :now', { status: 'pending', now })
      .getMany();
  }

  /** The holder's confirmed, not yet checked-in booking whose check-in window contains `now`. */
  findCheckInCandidate(
    userId: number,
    resourceId: number,
    now: Date,
    earlyCheckInMinutes: number,
  ): Promise<ReservationEntity | null> {
    const windowStart = new Date(now.getTime() + earlyCheckInMinutes * 60_000);
    return this.repo
      .createQueryBuilder('r')
      .where('r.resourceId = :resourceId AND r.userId = :userId AND r.status = :status', {
        resourceId,
        userId,
        status: 'confirmed',
      })
      .andWhere('r.checkedInAt IS NULL AND r.startTime <= :windowStart AND r.endTime > :now', { windowStart, now })
      .orderBy('r.startTime', 'ASC')
      .getOne();
  }

  /** The holder's confirmed, not yet checked-in bookings overlapping [from, to) (a session that ran in them). */
  findUncheckedOverlapping(userId: number, resourceId: number, from: Date, to: Date): Promise<ReservationEntity[]> {
    return this.repo
      .createQueryBuilder('r')
      .where('r.resourceId = :resourceId AND r.userId = :userId AND r.status = :status', {
        resourceId,
        userId,
        status: 'confirmed',
      })
      .andWhere('r.checkedInAt IS NULL AND r.startTime < :to AND r.endTime > :from', { from, to })
      .orderBy('r.startTime', 'ASC')
      .getMany();
  }

  /** Pending + confirmed bookings of the resource overlapping [from, to) (maintenance/health notices). */
  findLiveOverlapping(resourceId: number, from: Date, to: Date | null): Promise<ReservationEntity[]> {
    const query = this.repo
      .createQueryBuilder('r')
      .where('r.resourceId = :resourceId AND r.status IN (:...statuses)', {
        resourceId,
        statuses: ['pending', 'confirmed'],
      })
      .andWhere('r.endTime > :from', { from });
    if (to) query.andWhere('r.startTime < :to', { to });
    return query.orderBy('r.startTime', 'ASC').getMany();
  }

  /** Candidates for buffer-aware overlap checks (pending + confirmed), exact filtering is done by the caller. */
  findOverlapCandidates(
    manager: EntityManager,
    resourceId: number,
    from: Date,
    to: Date,
  ): Promise<ReservationEntity[]> {
    return manager
      .getRepository(ReservationEntity)
      .createQueryBuilder('r')
      .where('r.resourceId = :resourceId AND r.status IN (:...statuses)', {
        resourceId,
        statuses: ['pending', 'confirmed'],
      })
      .andWhere('r.startTime < :to AND r.endTime > :from', {
        from: new Date(from.getTime() - MAX_BUFFER_MINUTES * 60_000),
        to: new Date(to.getTime() + MAX_BUFFER_MINUTES * 60_000),
      })
      .getMany();
  }

  /** Confirmed bookings running at `now` ([start, end)), read through the host's transaction (start capacity hook). */
  findRunningConfirmed(manager: EntityManager, resourceId: number, now: Date): Promise<ReservationEntity[]> {
    return manager
      .getRepository(ReservationEntity)
      .createQueryBuilder('r')
      .where('r.resourceId = :resourceId AND r.status = :status', { resourceId, status: 'confirmed' })
      .andWhere('r.startTime <= :now AND r.endTime > :now', { now })
      .orderBy('r.startTime', 'ASC')
      .getMany();
  }

  /**
   * Which of `userIds` have a session (running or still starting) on the resource, read through the host's
   * transaction. Like the host's slot count: published sessions and pending starts, never supervisor rows.
   */
  async findUsersInSession(manager: EntityManager, resourceId: number, userIds: number[]): Promise<Set<number>> {
    const rows = await manager
      .getRepository(ResourceUsage)
      .createQueryBuilder('usage')
      .select('usage.userId', 'userId')
      .where('usage.resourceId = :resourceId AND usage.userId IN (:...userIds)', { resourceId, userIds })
      .andWhere('usage.usageAction = :action AND usage.endTime IS NULL', { action: ResourceUsageAction.Usage })
      .andWhere('(usage.isFinalized = 1 OR usage.lifecyclePending = 1)')
      .getRawMany<{ userId: number }>();
    return new Set(rows.map((row) => Number(row.userId)));
  }

  /**
   * Pending + confirmed bookings of the resource whose buffer-aware span can still matter at or after `now`
   * (the capacity reconciliation after a lowered limit).
   */
  findOccupyingFrom(resourceId: number, now: Date): Promise<ReservationEntity[]> {
    return this.findLiveOverlapping(resourceId, new Date(now.getTime() - MAX_BUFFER_MINUTES * 60_000), null);
  }

  countLiveForUser(manager: EntityManager, userId: number, resourceId: number, now: Date): Promise<number> {
    return manager
      .getRepository(ReservationEntity)
      .createQueryBuilder('r')
      .where('r.userId = :userId AND r.resourceId = :resourceId AND r.status IN (:...statuses)', {
        userId,
        resourceId,
        statuses: ['pending', 'confirmed'],
      })
      .andWhere('r.endTime > :now', { now })
      .getCount();
  }

  /** Number of pending/confirmed bookings of the resource starting after `now` (a COUNT, no rows loaded). */
  countFutureLive(resourceId: number, now: Date): Promise<number> {
    return this.repo
      .createQueryBuilder('r')
      .where('r.resourceId = :resourceId AND r.status IN (:...statuses) AND r.startTime > :now', {
        resourceId,
        statuses: ['pending', 'confirmed'],
        now,
      })
      .getCount();
  }

  /**
   * Applies `changes` to every pending/confirmed booking of the resource starting after `now`, in one
   * serialized transaction (select + one UPDATE with the same predicate), and returns the changed rows.
   */
  cancelFutureLive(resourceId: number, now: Date, changes: Partial<ReservationEntity>): Promise<ReservationEntity[]> {
    const where = 'resourceId = :resourceId AND status IN (:...statuses) AND startTime > :now';
    const parameters = { resourceId, statuses: ['pending', 'confirmed'], now };
    return this.context.runSerialized(async (manager) => {
      const repo = manager.getRepository(ReservationEntity);
      const rows = await repo
        .createQueryBuilder('r')
        .where('r.resourceId = :resourceId AND r.status IN (:...statuses) AND r.startTime > :now', parameters)
        .getMany();
      if (rows.length === 0) return [];
      await repo.createQueryBuilder().update(ReservationEntity).set(changes).where(where, parameters).execute();
      return rows.map((row) => Object.assign(row, changes));
    });
  }

  /** Bookings an iCal feed shows (pending, confirmed, ended) in [from, to), optionally only one holder's. */
  findForCalendar(resourceIds: number[], from: Date, to: Date, userId?: number): Promise<ReservationEntity[]> {
    if (resourceIds.length === 0) return Promise.resolve([]);
    const query = this.repo
      .createQueryBuilder('r')
      .where('r.resourceId IN (:...resourceIds) AND r.status IN (:...statuses)', {
        resourceIds,
        statuses: ['pending', 'confirmed', 'completed'],
      })
      .andWhere('r.endTime > :from AND r.startTime < :to', { from, to });
    if (userId !== undefined) query.andWhere('r.userId = :userId', { userId });
    return query.orderBy('r.startTime', 'ASC').take(5000).getMany();
  }

  /** Occupying bookings (pending + confirmed) overlapping [from, to) for availability views. */
  findOccupying(resourceId: number, from: Date, to: Date): Promise<ReservationEntity[]> {
    return this.findLiveOverlapping(resourceId, from, to);
  }

  listForUser(
    userId: number,
    scope: 'upcoming' | 'past',
    now: Date,
    status?: ReservationStatus,
  ): Promise<ReservationEntity[]> {
    const query = this.repo.createQueryBuilder('r').where('r.userId = :userId', { userId });
    if (scope === 'upcoming') {
      query.andWhere('r.status IN (:...live) AND r.endTime > :now', { live: ['pending', 'confirmed'], now });
      query.orderBy('r.startTime', 'ASC');
    } else {
      query.andWhere('(r.status NOT IN (:...live) OR r.endTime <= :now)', { live: ['pending', 'confirmed'], now });
      query.orderBy('r.startTime', 'DESC');
    }
    if (status) query.andWhere('r.status = :status', { status });
    return query.take(200).getMany();
  }

  async listManaged(filter: ManagedListFilter): Promise<{ items: ReservationEntity[]; total: number }> {
    const query = this.repo.createQueryBuilder('r');
    if (filter.resourceIds) {
      if (filter.resourceIds.length === 0) return { items: [], total: 0 };
      query.where('r.resourceId IN (:...resourceIds)', { resourceIds: filter.resourceIds });
    } else {
      query.where('1 = 1');
    }
    if (filter.status) query.andWhere('r.status = :status', { status: filter.status });
    if (filter.from) query.andWhere('r.endTime > :from', { from: filter.from });
    if (filter.to) query.andWhere('r.startTime < :to', { to: filter.to });
    const [items, total] = await query
      .orderBy('r.startTime', 'DESC')
      .skip(filter.skip)
      .take(filter.take)
      .getManyAndCount();
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
    changes: Partial<ReservationEntity>,
    options: { notCheckedIn?: boolean } = {},
  ): Promise<boolean> {
    const where = `id = :id AND status IN (:...from)${options.notCheckedIn ? ' AND checkedInAt IS NULL' : ''}`;
    // Writes run in the host's serialized transaction queue: on SQLite a second writer would otherwise fail with
    // SQLITE_BUSY while another request (or a core write) holds the lock.
    const result = await this.context.runSerialized((manager) =>
      manager
        .getRepository(ReservationEntity)
        .createQueryBuilder()
        .update(ReservationEntity)
        .set(changes)
        .where(where, { id, from })
        .execute(),
    );
    return (result.affected ?? 0) === 1;
  }

  /**
   * Claims a one-shot notification flag: `UPDATE ... SET flag = at WHERE id = ? AND flag IS NULL`.
   * Only the caller that gets `true` may send. Combine with the send inside the same transaction when
   * the send can roll the claim back.
   */
  async claimFlag(id: number, flag: ReminderFlag, at: Date, manager?: EntityManager): Promise<boolean> {
    if (!REMINDER_FLAGS.includes(flag)) throw new Error(`Unknown reminder flag ${String(flag)}`);
    const claim = (m: EntityManager) =>
      m
        .getRepository(ReservationEntity)
        .createQueryBuilder()
        .update(ReservationEntity)
        .set({ [flag]: at })
        .where(`id = :id AND ${flag} IS NULL`, { id })
        .execute();
    const result = await (manager ? claim(manager) : this.context.runSerialized(claim));
    return (result.affected ?? 0) === 1;
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
    manager?: EntityManager,
  ): Promise<boolean> {
    const insert = (m: EntityManager) =>
      m.getRepository(NoticeEntity).insert({ reservationId, kind, refKey, sentAt: at });
    try {
      await (manager ? insert(manager) : this.context.runSerialized(insert));
      return true;
    } catch (error) {
      if (/UNIQUE|constraint/i.test(String((error as { message?: string })?.message))) return false;
      throw error;
    }
  }

  /** Notices of the given kind already claimed for these reservations. */
  async findNotices(reservationIds: number[], kind: string): Promise<NoticeEntity[]> {
    if (reservationIds.length === 0) return [];
    return this.context
      .getRepository(NoticeEntity)
      .createQueryBuilder('n')
      .where('n.kind = :kind AND n.reservationId IN (:...reservationIds)', { kind, reservationIds })
      .getMany();
  }

  /** Release a notice claim (when the send failed and should be retried next tick). */
  async releaseNotice(reservationId: number, kind: string, refKey: string): Promise<void> {
    await this.context.runSerialized((manager) =>
      manager
        .getRepository(NoticeEntity)
        .createQueryBuilder()
        .delete()
        .where('reservationId = :reservationId AND kind = :kind AND refKey = :refKey', { reservationId, kind, refKey })
        .execute(),
    );
  }
}
