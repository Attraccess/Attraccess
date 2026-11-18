import {
  BillingTransaction,
  BillingTransactionItem,
  FormSubmission,
  Resource,
  ResourceMeter,
  User,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { ResourceUsageAction } from '@attraccess/application-models';
import type { SupervisionMode, UsageSessionResource } from '@attraccess/application-models';
import type {
  UsageBillingItemDraft,
  UsageLifecycleAttempt,
  UsageMeterRate,
  UsageSession,
  UsageSessionWithParties,
} from '@attraccess/application-models';
import { Injectable } from '@nestjs/common';
import { In, IsNull, Not } from 'typeorm';
import {
  DoorActionDraft,
  MachineCapacity,
  MissingBillingTransactionError,
  PendingSessionDraft,
  SessionPage,
  UsageSessionStore,
} from '../../../resources/usage/usage-session-store.port';
import { sessionLimitOf } from '../../../resources/usage/sessions/active-usage';
import { recoverOrphanedUsages } from '../../resource-usage-integrity';
import type { TransactionContext } from '../../transaction-context';
import { EntityManagerResolver } from '../entity-manager-resolver';
import { activeUsageWhere, countOccupiedSlots, findOccupyingUserIds } from './active-usage-queries';
import { toUsageLifecycleAttempt, toUsageSession } from './usage-session-mapping';
import { toResourceRecord } from '../resources/resource-mapping';
import { findRelations } from '../find-options';

/** Relations of running sessions and of session details (exported for the mapping spec). */
export const ACTIVE_RELATIONS = ['user', 'resource', 'billingTransaction', 'project', 'supervisorUser'];
export const DETAIL_RELATIONS = [
  'user',
  'project',
  'supervisorUser',
  'formSubmissions',
  'formSubmissions.form',
  'formSubmissions.user',
];

/** Sessions and attempts leave the adapter as plain records of the neutral model, mapped field by field. */
const toSession = toUsageSession;
const toSessions = (rows: ResourceUsage[]): UsageSession[] => rows.map(toUsageSession);
const toAttempt = toUsageLifecycleAttempt;
/** For reads that load the resource and the user relation. */
const toSessionWithParties = (row: ResourceUsage): UsageSessionWithParties =>
  toUsageSession(row) as UsageSessionWithParties;

/** TypeORM implementation of the usage session port. */
@Injectable()
export class TypeOrmUsageSessionStore implements UsageSessionStore {
  constructor(private readonly managers: EntityManagerResolver) {}

  async findSessionLimit(resourceId: number, context?: TransactionContext): Promise<number> {
    const resource = await this.managers.resolve(context).findOne(Resource, {
      where: { id: resourceId },
      select: { id: true, type: true, maxParallelSessions: true },
    });
    return sessionLimitOf(resource);
  }

  async findResource(resourceId: number, context?: TransactionContext): Promise<UsageSessionResource | null> {
    const resource = await this.managers
      .resolve(context)
      .getRepository(Resource)
      .findOne({ where: { id: resourceId } });
    return resource && toResourceRecord(resource);
  }

  async findSupervisionModes(resourceIds: number[]): Promise<Map<number, SupervisionMode | undefined>> {
    const resources = await this.managers
      .resolve()
      .getRepository(Resource)
      .find({
        where: { id: In(resourceIds) },
        select: { id: true, supervisionMode: true },
      });
    return new Map(resources.map((resource) => [resource.id, resource.supervisionMode]));
  }

  async userExists(userId: number, context?: TransactionContext): Promise<boolean> {
    return Boolean(
      await this.managers
        .resolve(context)
        .getRepository(User)
        .findOne({ where: { id: userId } }),
    );
  }

  async findGroupResourceIds(groupId: number): Promise<number[]> {
    const resources = await this.managers
      .resolve()
      .getRepository(Resource)
      .find({ where: { groups: { id: groupId } } });
    return resources.map((resource) => resource.id);
  }

  countCompletedSupervisedSessions(resourceIds: number[], userId: number): Promise<number> {
    return this.managers
      .resolve()
      .getRepository(ResourceUsage)
      .count({
        where: {
          resourceId: resourceIds.length === 1 ? resourceIds[0] : In(resourceIds),
          userId,
          supervisorUserId: Not(IsNull()),
          endTime: Not(IsNull()),
        },
      });
  }

  async findMachineCapacity(resourceId: number): Promise<MachineCapacity | null> {
    const resource = await this.managers
      .resolve()
      .getRepository(Resource)
      .findOne({
        where: { id: resourceId },
        select: { id: true, type: true, maxParallelSessions: true },
      });
    return resource && { type: resource.type, maxParallelSessions: resource.maxParallelSessions };
  }

  async findActiveSessions(resourceId: number, context?: TransactionContext): Promise<UsageSession[]> {
    return toSessions(
      await this.managers
        .resolve(context)
        .getRepository(ResourceUsage)
        .find({
          where: { resourceId, ...activeUsageWhere() },
          order: { startTime: 'ASC', id: 'ASC' },
          relations: findRelations(ACTIVE_RELATIONS),
        }),
    );
  }

  async findActiveSessionsByResource(resourceIds: number[]): Promise<Map<number, UsageSession[]>> {
    const map = new Map<number, UsageSession[]>(resourceIds.map((id) => [id, []]));
    if (resourceIds.length === 0) return map;
    const sessions = await this.managers
      .resolve()
      .getRepository(ResourceUsage)
      .find({
        where: { resourceId: In(resourceIds), ...activeUsageWhere() },
        order: { startTime: 'ASC', id: 'ASC' },
        relations: findRelations(ACTIVE_RELATIONS),
      });
    for (const session of sessions) map.get(session.resourceId)?.push(toSession(session));
    return map;
  }

  countActiveSessions(resourceId: number, context?: TransactionContext): Promise<number> {
    return this.managers.resolve(context).count(ResourceUsage, { where: { resourceId, ...activeUsageWhere() } });
  }

  async findOwnOpenSession(
    resourceId: number,
    userId: number,
    context?: TransactionContext,
  ): Promise<UsageSession | null> {
    const session = await this.managers.resolve(context).findOne(ResourceUsage, {
      where: { resourceId, userId, usageAction: ResourceUsageAction.Usage, endTime: IsNull() },
    });
    return session && toSession(session);
  }

  findOccupyingUserIds(resourceId: number, context?: TransactionContext): Promise<number[]> {
    return findOccupyingUserIds(this.managers.resolve(context), resourceId);
  }

  countOccupiedSlots(resourceId: number, context?: TransactionContext): Promise<number> {
    return countOccupiedSlots(this.managers.resolve(context), resourceId);
  }

  async findPublishedSession(resourceId: number, usageId: number): Promise<UsageSession | null> {
    const session = await this.managers
      .resolve()
      .getRepository(ResourceUsage)
      .findOne({
        where: { id: usageId, resourceId, lifecyclePending: false },
        relations: findRelations(DETAIL_RELATIONS),
      });
    return session && toSession(session);
  }

  async findHistory(resourceId: number, page: number, limit: number, userId?: number): Promise<SessionPage> {
    const where: { resourceId: number; lifecyclePending: boolean; userId?: number } = {
      resourceId,
      lifecyclePending: false,
    };
    if (userId) where.userId = userId;
    const [data, total] = await this.managers
      .resolve()
      .getRepository(ResourceUsage)
      .findAndCount({
        where,
        skip: (page - 1) * limit,
        take: limit,
        order: { startTime: 'DESC' },
        relations: findRelations(DETAIL_RELATIONS),
      });
    return { data: toSessions(data), total };
  }

  async findSessionForProjectChange(resourceId: number, usageId: number): Promise<UsageSession | null> {
    const session = await this.managers
      .resolve()
      .getRepository(ResourceUsage)
      .findOne({
        where: { id: usageId, resourceId },
        relations: { user: true, project: true, resource: true },
      });
    return session && toSession(session);
  }

  async assignProject(usageId: number, projectId: number | null): Promise<UsageSessionWithParties> {
    const repository = this.managers.resolve().getRepository(ResourceUsage);
    await repository.update(usageId, { projectId });
    return toSessionWithParties(
      await repository.findOneOrFail({
        where: { id: usageId },
        relations: { resource: true, user: true, project: true },
      }),
    );
  }

  async findSessionForEvent(usageId: number, context?: TransactionContext): Promise<UsageSessionWithParties | null> {
    const session = await this.managers
      .resolve(context)
      .getRepository(ResourceUsage)
      .findOne({
        where: { id: usageId },
        relations: { resource: true, user: true },
      });
    return session && toSessionWithParties(session);
  }

  async findEndableSession(
    resourceId: number,
    usageId: number,
    context?: TransactionContext,
  ): Promise<UsageSession | null> {
    const manager = this.managers.resolve(context);
    const session = await manager.findOne(ResourceUsage, {
      where: { id: usageId, resourceId, ...activeUsageWhere() },
      relations: { user: true },
    });
    if (!session) return null;
    const beingEnded = await manager.exists(ResourceUsageLifecycleAttempt, {
      where: { resourceId, kind: 'end', previousUsageId: usageId },
    });
    return beingEnded ? null : toSession(session);
  }

  async findSessionIdsBeingEnded(resourceId: number, context?: TransactionContext): Promise<Set<number>> {
    const attempts = await this.managers.resolve(context).find(ResourceUsageLifecycleAttempt, {
      where: { resourceId, kind: 'end' },
    });
    return new Set(attempts.flatMap((attempt) => (attempt.previousUsageId === null ? [] : [attempt.previousUsageId])));
  }

  async findMeterRates(resourceId: number, context?: TransactionContext): Promise<UsageMeterRate[]> {
    const meters = await this.managers.resolve(context).find(ResourceMeter, { where: { resourceId } });
    return meters.map((meter) => ({
      meterId: meter.id,
      name: meter.name,
      creditsPerUnit: meter.creditsPerUnit,
      allocation: meter.allocation,
    }));
  }

  async isLifecycleBlocked(resourceId: number, sharedMachine: boolean, context?: TransactionContext): Promise<boolean> {
    const manager = this.managers.resolve(context);
    if (sharedMachine) {
      return Boolean(await manager.findOne(ResourceUsageLifecycleAttempt, { where: { resourceId, kind: 'takeover' } }));
    }
    return Boolean(
      (await manager.findOne(ResourceUsageLifecycleAttempt, { where: { resourceId } })) ||
      (await manager.findOne(ResourceUsage, { where: { resourceId, endTime: IsNull(), lifecyclePending: true } })),
    );
  }

  async findAttempt(
    attemptId: string,
    resourceId: number,
    context?: TransactionContext,
  ): Promise<UsageLifecycleAttempt | null> {
    const attempt = await this.managers
      .resolve(context)
      .findOne(ResourceUsageLifecycleAttempt, { where: { id: attemptId, resourceId } });
    return attempt && toAttempt(attempt);
  }

  async isSessionBeingEnded(usageId: number, context?: TransactionContext): Promise<boolean> {
    return Boolean(
      await this.managers
        .resolve(context)
        .findOne(ResourceUsageLifecycleAttempt, { where: { previousUsageId: usageId } }),
    );
  }

  async saveAttempt(attempt: UsageLifecycleAttempt, context?: TransactionContext): Promise<UsageLifecycleAttempt> {
    return toAttempt(
      await this.managers.resolve(context).save(ResourceUsageLifecycleAttempt, {
        id: attempt.id,
        resourceId: attempt.resourceId,
        kind: attempt.kind,
        candidateUsageId: attempt.candidateUsageId,
        previousUsageId: attempt.previousUsageId,
        transitionTime: attempt.transitionTime,
        formSubmissions: attempt.formSubmissions as FormSubmission[],
        billingItems: attempt.billingItems,
      }),
    );
  }

  async deleteAttempt(attemptId: string, resourceId: number, context?: TransactionContext): Promise<void> {
    await this.managers.resolve(context).delete(ResourceUsageLifecycleAttempt, { id: attemptId, resourceId });
  }

  async clearAttemptCandidate(attemptId: string, resourceId: number, context?: TransactionContext): Promise<void> {
    await this.managers
      .resolve(context)
      .update(ResourceUsageLifecycleAttempt, { id: attemptId, resourceId }, { candidateUsageId: null });
  }

  async setBillingItems(
    attemptId: string,
    items: UsageBillingItemDraft[],
    context?: TransactionContext,
  ): Promise<void> {
    await this.managers.resolve(context).update(ResourceUsageLifecycleAttempt, attemptId, { billingItems: items });
  }

  async listAttemptIds(): Promise<{ id: string; createdAt: Date }[]> {
    const attempts = await this.managers.resolve().find(ResourceUsageLifecycleAttempt, {
      select: { id: true, createdAt: true },
    });
    return attempts.map(({ id, createdAt }) => ({ id, createdAt }));
  }

  async findAttemptsByIds(ids: string[], context?: TransactionContext): Promise<UsageLifecycleAttempt[]> {
    if (ids.length === 0) return [];
    return (await this.managers.resolve(context).find(ResourceUsageLifecycleAttempt, { where: { id: In(ids) } })).map(
      toAttempt,
    );
  }

  async createPendingSession(
    draft: PendingSessionDraft,
    context?: TransactionContext,
  ): Promise<UsageSessionWithParties> {
    const manager = this.managers.resolve(context);
    const { resourceId, userId } = draft;
    const usageData: Partial<ResourceUsage> = {
      resourceId,
      usageAction: ResourceUsageAction.Usage,
      userId,
      startTime: draft.startTime,
      startNotes: draft.startNotes,
      endTime: null,
      endNotes: null,
      isFinalized: false,
      lifecyclePending: true,
      sessionDurationCreditsPerMinute: draft.sessionDurationCreditsPerMinute,
      operatingDurationCreditsPerMinute: draft.operatingDurationCreditsPerMinute,
      creditsPerUsage: draft.creditsPerUsage,
      meterRates: draft.meterRates,
    };
    if (draft.supervisorUserId !== undefined) usageData.supervisorUserId = draft.supervisorUserId;
    if (draft.projectId !== undefined) usageData.projectId = draft.projectId;

    await manager.createQueryBuilder().insert().into(ResourceUsage).values(usageData).execute();

    const createdSession = await manager.findOne(ResourceUsage, {
      where: { resourceId, userId, endTime: IsNull(), lifecyclePending: true },
      order: { startTime: 'DESC' },
      relations: { resource: true, user: true, project: true },
    });
    if (!createdSession) throw new Error('Failed to retrieve the newly created session.');

    // Use the user read inside this transaction, not the potentially stale authentication object.
    createdSession.billingFactor = createdSession.user.billingFactor;
    await manager.update(ResourceUsage, createdSession.id, { billingFactor: createdSession.billingFactor });
    return toSessionWithParties(createdSession);
  }

  async findPendingSession(usageId: number, context?: TransactionContext): Promise<UsageSessionWithParties | null> {
    const session = await this.managers.resolve(context).findOne(ResourceUsage, {
      where: { id: usageId, lifecyclePending: true },
      relations: { resource: true, user: true, project: true },
    });
    return session && toSessionWithParties(session);
  }

  async deletePendingSession(usageId: number, context?: TransactionContext): Promise<boolean> {
    const result = await this.managers.resolve(context).delete(ResourceUsage, { id: usageId, lifecyclePending: true });
    return result.affected !== 0;
  }

  async publishSession(usageId: number, context?: TransactionContext): Promise<void> {
    await this.managers.resolve(context).update(ResourceUsage, usageId, { isFinalized: true, lifecyclePending: false });
  }

  async endSessionIfOpen(
    usageId: number,
    end: { endTime: Date; endNotes: string | null | undefined },
    context?: TransactionContext,
  ): Promise<boolean> {
    const result = await this.managers
      .resolve(context)
      .update(ResourceUsage, { id: usageId, endTime: IsNull() }, { endTime: end.endTime, endNotes: end.endNotes });
    return result.affected !== 0;
  }

  async setAttributedOperatingDuration(usageId: number, minutes: number, context?: TransactionContext): Promise<void> {
    await this.managers
      .resolve(context)
      .update(ResourceUsage, usageId, { attributedOperatingDurationInMinutes: minutes });
  }

  async findSessionWithRelations(
    usageId: number,
    shape: 'ended' | 'started',
    context?: TransactionContext,
  ): Promise<UsageSessionWithParties> {
    return toSessionWithParties(
      await this.managers.resolve(context).findOneOrFail(ResourceUsage, {
        where: { id: usageId },
        relations: findRelations(shape === 'ended' ? ['user', 'resource'] : ['resource', 'user', 'project']),
      }),
    );
  }

  async applyAttemptDrafts(attempt: UsageLifecycleAttempt, context?: TransactionContext): Promise<void> {
    const manager = this.managers.resolve(context);
    for (const submission of attempt.formSubmissions) {
      await manager.save(FormSubmission, {
        formId: submission.formId,
        resourceUsageId: submission.resourceUsageId,
        userId: submission.userId,
        action: submission.action,
        data: submission.data,
      } as Partial<FormSubmission>);
    }
    for (const { usageId, quantity, ...item } of attempt.billingItems) {
      const transaction = await manager.findOne(BillingTransaction, { where: { resourceUsageId: usageId } });
      if (!transaction) throw new MissingBillingTransactionError();
      const where = {
        billingTransactionId: transaction.id,
        ...item,
        description: item.description === null ? IsNull() : item.description,
        externalReference: item.externalReference === null ? IsNull() : item.externalReference,
      };
      const existing = await manager.findOne(BillingTransactionItem, { where });
      if (existing) {
        await manager.update(BillingTransactionItem, existing.id, { quantity: existing.quantity + quantity });
      } else {
        await manager.save(BillingTransactionItem, { billingTransactionId: transaction.id, ...item, quantity });
      }
    }
  }

  async recordDoorAction(draft: DoorActionDraft): Promise<UsageSessionWithParties> {
    const repository = this.managers.resolve().getRepository(ResourceUsage);
    const usageData = {
      resourceId: draft.resourceId,
      usageAction: draft.action,
      userId: draft.userId,
      startTime: new Date(),
      startNotes: null,
      endTime: new Date(),
      endNotes: null,
    };
    const saved = await repository.save(usageData, { reload: true });
    return toSessionWithParties(
      await repository.findOneOrFail({ where: { id: saved.id }, relations: { user: true, resource: true } }),
    );
  }

  recoverOrphanedSessions(context?: TransactionContext): Promise<number> {
    return recoverOrphanedUsages(this.managers.resolve(context));
  }
}
