import { ResourceUsage } from '@attraccess/database-entities';
import type { UsageSession } from '@attraccess/application-models';
import { Injectable } from '@nestjs/common';
import { IsNull, LessThanOrEqual } from 'typeorm';
import type {
  OverdueSession,
  SessionDeadlineStore,
} from '../../../resources/usage/session-duration/session-deadline-store.port';
import { MINUTE_MS } from '../../../resources/usage/session-duration/session-duration.rules';
import type { TransactionContext } from '../../transaction-context';
import { EntityManagerResolver } from '../entity-manager-resolver';
import { activeUsageSql, activeUsageWhere } from './active-usage-queries';
import { toUsageSession } from './usage-session-mapping';

/** TypeORM implementation of the session deadline port. */
@Injectable()
export class TypeOrmSessionDeadlineStore implements SessionDeadlineStore {
  constructor(private readonly managers: EntityManagerResolver) {}

  async extend(
    usageId: number,
    expected: Date,
    next: { autoEndAt: Date; warnedOffsetMinutes: number | null },
    context?: TransactionContext,
  ): Promise<boolean> {
    const result = await this.managers
      .resolve(context)
      .createQueryBuilder()
      .update(ResourceUsage)
      .set({ autoEndAt: next.autoEndAt, autoEndWarnedOffsetMinutes: next.warnedOffsetMinutes })
      .where(`id = :usageId AND "endTime" IS NULL AND "autoEndAt" = :expected`, { usageId, expected })
      .execute();
    return result.affected === 1;
  }

  async lockDeadline(usageId: number, context: TransactionContext): Promise<{ autoEndAt: Date | null } | null> {
    const row = await this.managers.resolve(context).findOne(ResourceUsage, {
      where: { id: usageId, endTime: IsNull() },
      select: { id: true, autoEndAt: true },
      lock: { mode: 'for_no_key_update' },
    });
    return row ? { autoEndAt: row.autoEndAt ?? null } : null;
  }

  async findOverdue(now: Date, limit: number): Promise<OverdueSession[]> {
    const rows = await this.managers.resolve().find(ResourceUsage, {
      where: { ...activeUsageWhere(), autoEndAt: LessThanOrEqual(now) },
      select: { id: true, resourceId: true, autoEndAt: true },
      order: { autoEndAt: 'ASC', id: 'ASC' },
      take: limit,
    });
    return rows.map((row) => ({ id: row.id, resourceId: row.resourceId }));
  }

  async findEndingWithin(now: Date, withinMinutes: number, smallestOffsetMinutes: number): Promise<UsageSession[]> {
    const rows = await this.managers
      .resolve()
      .createQueryBuilder(ResourceUsage, 'usage')
      .leftJoinAndSelect('usage.user', 'user')
      .leftJoinAndSelect('usage.resource', 'resource')
      .where(activeUsageSql('usage'))
      .andWhere('usage.autoEndAt > :now', { now })
      .andWhere('usage.autoEndAt <= :until', { until: new Date(now.getTime() + withinMinutes * MINUTE_MS) })
      .andWhere('(usage.autoEndWarnedOffsetMinutes IS NULL OR usage.autoEndWarnedOffsetMinutes > :smallest)', {
        smallest: smallestOffsetMinutes,
      })
      .orderBy('usage.autoEndAt', 'ASC')
      .getMany();
    return rows.map(toUsageSession);
  }

  async claimWarning(usageId: number, autoEndAt: Date, offsetMinutes: number): Promise<boolean> {
    const result = await this.managers
      .resolve()
      .createQueryBuilder()
      .update(ResourceUsage)
      .set({ autoEndWarnedOffsetMinutes: offsetMinutes })
      .where(
        `id = :usageId AND "endTime" IS NULL AND "autoEndAt" = :autoEndAt AND ("autoEndWarnedOffsetMinutes" IS NULL OR "autoEndWarnedOffsetMinutes" > :offsetMinutes)`,
        { usageId, autoEndAt, offsetMinutes },
      )
      .execute();
    return result.affected === 1;
  }
}
