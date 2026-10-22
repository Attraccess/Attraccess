import {
  Resource,
  ResourceMeter,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceFlowNode,
  ResourceFlowEdge,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { EntityManager, In, LessThan, MoreThan } from 'typeorm';
import { toApplicationRecord } from '../../../database/sqlite/backend';
import { findActiveUsage } from '../../../database/sqlite/usage-integrity';
import {
  MeteringPersistence,
  MeterNameConflictError,
  NewMeteringOperation,
  MeteringOperationUpdate,
  NewMeteringSession,
  MeteringSessionUpdate,
} from './port';
export class TypeormMeteringPersistence extends MeteringPersistence {
  constructor(private readonly manager: EntityManager) {
    super();
  }
  async meter(resourceId: number, meterId: number): Promise<ResourceMeter | null> {
    return toApplicationRecord(await this.manager.findOne(ResourceMeter, { where: { id: meterId, resourceId } }));
  }
  async meters(resourceId: number, ordered = false): Promise<ResourceMeter[]> {
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceMeter)
        .find({ where: { resourceId }, ...(ordered ? { order: { id: 'ASC' as const } } : {}) }),
    );
  }
  async allMeters(): Promise<ResourceMeter[]> {
    return toApplicationRecord(await this.manager.getRepository(ResourceMeter).find());
  }
  resourceExists(resourceId: number): Promise<boolean> {
    return this.manager.existsBy(Resource, { id: resourceId });
  }
  async createMeter(resourceId: number, name: string): Promise<ResourceMeter> {
    return this.meterNameWrite(async () =>
      toApplicationRecord(await this.manager.getRepository(ResourceMeter).save({ resourceId, name })),
    );
  }
  async renameMeter(resourceId: number, meterId: number, name: string): Promise<void> {
    await this.meterNameWrite(async () => {
      await this.manager.getRepository(ResourceMeter).update({ id: meterId, resourceId }, { name });
    });
  }
  async setRate(meterId: number, creditsPerUnit: number): Promise<void> {
    await this.manager.getRepository(ResourceMeter).update(meterId, { creditsPerUnit });
  }
  async updateMeterState(
    meterId: number,
    data: Pick<ResourceMeter, 'counterValue' | 'lifetimeValue' | 'latestObservedAt'>,
  ): Promise<void> {
    await this.manager.update(ResourceMeter, meterId, data);
  }
  async flowNodes(resourceId: number): Promise<ResourceFlowNode[]> {
    return toApplicationRecord(await this.manager.getRepository(ResourceFlowNode).find({ where: { resourceId } }));
  }
  async flowEdges(resourceId: number): Promise<ResourceFlowEdge[]> {
    return toApplicationRecord(await this.manager.getRepository(ResourceFlowEdge).find({ where: { resourceId } }));
  }
  async activeUsage(resourceId: number): Promise<ResourceUsage | null> {
    return toApplicationRecord(await findActiveUsage(this.manager, resourceId));
  }
  async usage(usageId: number, withUser = false): Promise<ResourceUsage | null> {
    return toApplicationRecord(
      await this.manager.findOne(ResourceUsage, {
        where: { id: usageId },
        ...(withUser ? { relations: ['user'] } : {}),
      }),
    );
  }
  async usageStart(usageId: number): Promise<{ startTime: Date } | null> {
    return toApplicationRecord(
      await this.manager.findOne(ResourceUsage, { where: { id: usageId }, select: { startTime: true } }),
    );
  }
  async attempt(
    resourceId: number,
  ): Promise<Pick<ResourceUsageLifecycleAttempt, 'id' | 'candidateUsageId' | 'previousUsageId'> | null> {
    return toApplicationRecord(await this.manager.findOne(ResourceUsageLifecycleAttempt, { where: { resourceId } }));
  }
  hasAttempt(resourceId: number): Promise<boolean> {
    return this.manager.existsBy(ResourceUsageLifecycleAttempt, { resourceId });
  }
  conflictingIdleUsage(
    resourceId: number,
    meterId: number,
    requestedAt: Date,
    activeUsageId: number | null,
  ): Promise<boolean> {
    return this.manager
      .createQueryBuilder(ResourceUsage, 'u')
      .leftJoin(ResourceMeteringSession, 's', 's.usageId = u.id AND s.meterId = :meterId', { meterId })
      .where('u.resourceId = :resourceId', { resourceId })
      .andWhere(
        '(u.startTime >= :requestedAt OR u.endTime >= :requestedAt OR (u.id = :activeUsageId AND s.id IS NOT NULL))',
        { requestedAt, activeUsageId },
      )
      .getExists();
  }
  async session(sessionId: string): Promise<ResourceMeteringSession | null> {
    return toApplicationRecord(await this.manager.findOne(ResourceMeteringSession, { where: { id: sessionId } }));
  }
  async resourceSession(resourceId: number, sessionId: string): Promise<ResourceMeteringSession | null> {
    return toApplicationRecord(
      await this.manager.getRepository(ResourceMeteringSession).findOne({ where: { id: sessionId, resourceId } }),
    );
  }
  async activeSession(resourceId: number, meterId: number, usageId: number): Promise<ResourceMeteringSession | null> {
    return toApplicationRecord(
      await this.manager.findOne(ResourceMeteringSession, {
        where: { resourceId, meterId, usageId, status: ResourceMeteringSessionStatus.Active },
      }),
    );
  }
  async activeSessions(usageId: number, resourceId?: number): Promise<ResourceMeteringSession[]> {
    return toApplicationRecord(
      await this.manager.find(ResourceMeteringSession, {
        where: {
          usageId,
          ...(resourceId === undefined ? {} : { resourceId }),
          status: ResourceMeteringSessionStatus.Active,
        },
      }),
    );
  }
  async sessions(usageId: number): Promise<ResourceMeteringSession[]> {
    return toApplicationRecord(await this.manager.find(ResourceMeteringSession, { where: { usageId } }));
  }
  async unsettledSessions(resourceId: number): Promise<ResourceMeteringSession[]> {
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceMeteringSession)
        .find({
          where: {
            resourceId,
            status: In([ResourceMeteringSessionStatus.Pending, ResourceMeteringSessionStatus.Failed]),
          },
          order: { createdAt: 'DESC' },
          take: 20,
        }),
    );
  }
  async createSession(data: NewMeteringSession): Promise<ResourceMeteringSession> {
    return toApplicationRecord(await this.manager.getRepository(ResourceMeteringSession).save(data));
  }
  async updateSession(sessionId: string, data: MeteringSessionUpdate): Promise<void> {
    await this.manager.update(ResourceMeteringSession, sessionId, data);
  }
  async deleteSession(sessionId: string): Promise<void> {
    await this.manager.getRepository(ResourceMeteringSession).delete(sessionId);
  }
  async deleteUsageSessions(usageId: number): Promise<void> {
    await this.manager.delete(ResourceMeteringSession, { usageId });
  }
  async failEarlierPendingSessions(
    resourceId: number,
    meterId: number,
    usageId: number,
    reason: string,
  ): Promise<void> {
    await this.manager.update(
      ResourceMeteringSession,
      { resourceId, meterId, usageId: LessThan(usageId), status: ResourceMeteringSessionStatus.Pending },
      { status: ResourceMeteringSessionStatus.Failed, failureReason: reason },
    );
  }
  async failPendingSessions(meterId: number, reason: string): Promise<void> {
    await this.manager.update(
      ResourceMeteringSession,
      { meterId, status: ResourceMeteringSessionStatus.Pending },
      { status: ResourceMeteringSessionStatus.Failed, failureReason: reason },
    );
  }
  async compromiseSessions(usageId: number, meterIds: readonly number[], reason: string): Promise<void> {
    await this.manager
      .getRepository(ResourceMeteringSession)
      .update({ usageId, meterId: In([...meterIds]) }, { compromisedReason: reason });
  }
  newerSessionCount(resourceId: number, meterId: number, usageId: number): Promise<number> {
    return this.manager.count(ResourceMeteringSession, { where: { resourceId, meterId, usageId: MoreThan(usageId) } });
  }
  async waiveSession(resourceId: number, sessionId: string, settledAt: Date): Promise<number> {
    return (
      (
        await this.manager
          .getRepository(ResourceMeteringSession)
          .update(
            {
              id: sessionId,
              resourceId,
              status: In([ResourceMeteringSessionStatus.Pending, ResourceMeteringSessionStatus.Failed]),
            },
            { status: ResourceMeteringSessionStatus.Waived, settledAt },
          )
      ).affected ?? 0
    );
  }
  async operation(operationId: string): Promise<ResourceMeteringOperation | null> {
    return toApplicationRecord(await this.manager.findOne(ResourceMeteringOperation, { where: { id: operationId } }));
  }
  async finalOperation(operationId: string, sessionId: string): Promise<ResourceMeteringOperation | null> {
    return toApplicationRecord(
      await this.manager.findOne(ResourceMeteringOperation, {
        where: { id: operationId, sessionId, kind: 'final', status: 'completed' },
      }),
    );
  }
  async saveOperation(data: NewMeteringOperation): Promise<ResourceMeteringOperation> {
    return toApplicationRecord(await this.manager.getRepository(ResourceMeteringOperation).save(data));
  }
  async updateOperation(operationId: string, data: MeteringOperationUpdate): Promise<void> {
    await this.manager.update(ResourceMeteringOperation, operationId, data);
  }
  async closePendingOperation(
    operationId: string,
    status: 'failed' | 'expired',
    error: string,
    at: Date,
  ): Promise<void> {
    await this.manager
      .getRepository(ResourceMeteringOperation)
      .update({ id: operationId, status: 'pending' }, { status, error, completedAt: at });
  }
  async expirePendingOperations(error: string): Promise<void> {
    await this.manager
      .getRepository(ResourceMeteringOperation)
      .update({ status: 'pending' }, { status: 'expired', error });
  }
  private async meterNameWrite<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (String(error).includes('UNIQUE')) throw new MeterNameConflictError();
      throw error;
    }
  }
}
