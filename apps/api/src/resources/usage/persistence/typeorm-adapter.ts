import { activeUsageWhere } from '../../../database/sqlite/usage-integrity';
import { recoverOrphanedUsages } from '../../../database/resource-usage-integrity';
import {
  Resource,
  ResourceIntroducer,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  LifecycleBillingItem,
  ResourceMeter,
  User,
} from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository, EntityManager } from 'typeorm';
import { toApplicationRecord } from '../../../database/sqlite/backend';
import { UsageNoteRecipients, SupervisedUsageHistory, UsagePersistence, NewLifecycleAttempt } from './port';

@Injectable()
export class TypeormUsageNoteRecipients extends UsageNoteRecipients {
  constructor(
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(ResourceIntroducer) private readonly grants: Repository<ResourceIntroducer>,
    @InjectRepository(User) private readonly userRows: Repository<User>,
  ) {
    super();
  }
  async resourceWithGroups(resourceId: number): Promise<Resource | null> {
    return toApplicationRecord(await this.resources.findOne({ where: { id: resourceId }, relations: ['groups'] }));
  }
  async users(ids: readonly number[]): Promise<User[]> {
    return toApplicationRecord(await this.userRows.findBy({ id: In([...ids]) }));
  }
  async introducers(resourceId: number, groupIds: readonly number[]): Promise<ResourceIntroducer[]> {
    return toApplicationRecord(
      await this.grants.find({
        where: [{ resourceId }, ...(groupIds.length ? [{ resourceGroupId: In([...groupIds]) }] : [])],
        relations: ['user'],
      }),
    );
  }
}

@Injectable()
export class TypeormSupervisedUsageHistory extends SupervisedUsageHistory {
  constructor(
    @InjectRepository(ResourceUsage) private readonly usages: Repository<ResourceUsage>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
  ) {
    super();
  }
  async resource(resourceId: number): Promise<Resource | null> {
    return toApplicationRecord(await this.resources.findOne({ where: { id: resourceId } }));
  }
  async completedCount(resourceIds: readonly number[], userId: number): Promise<number> {
    return this.usages.count({
      where: {
        resourceId: resourceIds.length === 1 ? resourceIds[0] : In([...resourceIds]),
        userId,
        supervisorUserId: Not(IsNull()),
        endTime: Not(IsNull()),
      },
    });
  }
  async groupResourceIds(groupId: number): Promise<number[]> {
    return (await this.resources.find({ where: { groups: { id: groupId } } })).map(({ id }) => id);
  }
}

const ACTIVE_RELATIONS = ['user', 'resource', 'billingTransaction', 'project', 'supervisorUser'];
const DETAIL_RELATIONS = [
  'user',
  'project',
  'supervisorUser',
  'formSubmissions',
  'formSubmissions.form',
  'formSubmissions.user',
];
export class TypeormUsagePersistence extends UsagePersistence {
  constructor(private readonly manager: EntityManager) {
    super();
  }
  async resource(id: number): Promise<Resource | null> {
    return toApplicationRecord(await this.manager.getRepository(Resource).findOne({ where: { id } }));
  }
  async user(id: number): Promise<User | null> {
    return toApplicationRecord(await this.manager.getRepository(User).findOne({ where: { id } }));
  }
  async activeSession(resourceId: number): Promise<ResourceUsage | null> {
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceUsage)
        .findOne({
          where: { resourceId, ...activeUsageWhere() },
          order: { startTime: 'DESC', id: 'DESC' },
          relations: ACTIVE_RELATIONS,
        }),
    );
  }
  async activeSessions(resourceIds: readonly number[]): Promise<ResourceUsage[]> {
    if (!resourceIds.length) return [];
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceUsage)
        .find({
          where: { resourceId: In([...resourceIds]), ...activeUsageWhere() },
          order: { startTime: 'DESC', id: 'DESC' },
          relations: ACTIVE_RELATIONS,
        }),
    );
  }
  async sessionDetails(resourceId: number, usageId: number): Promise<ResourceUsage | null> {
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceUsage)
        .findOne({ where: { id: usageId, resourceId, lifecyclePending: false }, relations: DETAIL_RELATIONS }),
    );
  }
  async history(
    resourceId: number,
    userId: number | undefined,
    skip: number,
    take: number,
  ): Promise<[ResourceUsage[], number]> {
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceUsage)
        .findAndCount({
          where: { resourceId, lifecyclePending: false, ...(userId ? { userId } : {}) },
          skip,
          take,
          order: { startTime: 'DESC' },
          relations: DETAIL_RELATIONS,
        }),
    );
  }
  async usageWithResourceAndUser(usageId: number): Promise<ResourceUsage | null> {
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceUsage)
        .findOne({ where: { id: usageId }, relations: ['resource', 'user'] }),
    );
  }
  async usageWithProject(usageId: number): Promise<ResourceUsage | null> {
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceUsage)
        .findOne({ where: { id: usageId }, relations: ['resource', 'user', 'project'] }),
    );
  }
  async usageForProjectUpdate(resourceId: number, usageId: number): Promise<ResourceUsage | null> {
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceUsage)
        .findOne({ where: { id: usageId, resourceId }, relations: ['user', 'project', 'resource'] }),
    );
  }
  async saveUsage(usage: Partial<ResourceUsage>): Promise<ResourceUsage> {
    return toApplicationRecord(await this.manager.getRepository(ResourceUsage).save(usage, { reload: true }));
  }
  async pendingCandidate(resourceId: number, userId: number): Promise<ResourceUsage | null> {
    return toApplicationRecord(
      await this.manager.findOne(ResourceUsage, {
        where: { resourceId, userId, endTime: IsNull(), lifecyclePending: true },
        order: { startTime: 'DESC' },
        relations: ['resource', 'user', 'project'],
      }),
    );
  }
  async candidate(id: number): Promise<ResourceUsage | null> {
    return toApplicationRecord(
      await this.manager.findOne(ResourceUsage, {
        where: { id, lifecyclePending: true },
        relations: ['resource', 'user', 'project'],
      }),
    );
  }
  async insertCandidate(data: Partial<ResourceUsage>): Promise<void> {
    await this.manager.createQueryBuilder().insert().into(ResourceUsage).values(data).execute();
  }
  async deletePendingCandidate(id: number): Promise<number> {
    return (await this.manager.delete(ResourceUsage, { id, lifecyclePending: true })).affected ?? 0;
  }
  async endActiveUsage(id: number, endTime: Date, endNotes: string | null | undefined): Promise<number> {
    return (await this.manager.update(ResourceUsage, { id, endTime: IsNull() }, { endTime, endNotes })).affected ?? 0;
  }
  async finalizeUsage(id: number): Promise<void> {
    await this.manager.update(ResourceUsage, id, { isFinalized: true, lifecyclePending: false });
  }
  async setBillingFactor(id: number, billingFactor: number): Promise<void> {
    await this.manager.update(ResourceUsage, id, { billingFactor });
  }
  async setAttributedDuration(id: number, minutes: number): Promise<void> {
    await this.manager.update(ResourceUsage, id, { attributedOperatingDurationInMinutes: minutes });
  }
  async attempt(id: string, resourceId: number): Promise<ResourceUsageLifecycleAttempt | null> {
    return toApplicationRecord(
      await this.manager.findOne(ResourceUsageLifecycleAttempt, { where: { id, resourceId } }),
    );
  }
  async attemptForResource(resourceId: number): Promise<ResourceUsageLifecycleAttempt | null> {
    return toApplicationRecord(await this.manager.findOne(ResourceUsageLifecycleAttempt, { where: { resourceId } }));
  }
  async attempts(): Promise<ResourceUsageLifecycleAttempt[]> {
    return toApplicationRecord(await this.manager.find(ResourceUsageLifecycleAttempt));
  }
  async saveAttempt(data: NewLifecycleAttempt): Promise<ResourceUsageLifecycleAttempt> {
    return toApplicationRecord(await this.manager.save(ResourceUsageLifecycleAttempt, data));
  }
  async deleteAttempt(id: string, resourceId?: number): Promise<void> {
    await this.manager.delete(ResourceUsageLifecycleAttempt, resourceId === undefined ? id : { id, resourceId });
  }
  async clearAttemptCandidate(id: string, resourceId: number): Promise<void> {
    await this.manager.update(ResourceUsageLifecycleAttempt, { id, resourceId }, { candidateUsageId: null });
  }
  async setAttemptBillingItems(id: string, items: LifecycleBillingItem[]): Promise<void> {
    await this.manager.update(ResourceUsageLifecycleAttempt, id, { billingItems: items });
  }
  async pendingUsageExists(resourceId: number): Promise<boolean> {
    return !!(await this.manager.findOne(ResourceUsage, {
      where: { resourceId, endTime: IsNull(), lifecyclePending: true },
    }));
  }
  async recoveryResourceIds(): Promise<number[]> {
    const usages = await this.manager
      .getRepository(ResourceUsage)
      .find({ where: [{ isFinalized: false }, { lifecyclePending: true }], select: ['resourceId'] });
    const attempts = await this.manager.getRepository(ResourceUsageLifecycleAttempt).find({ select: ['resourceId'] });
    return [...new Set([...usages, ...attempts].map((row) => row.resourceId))];
  }
  recoverOrphans(): Promise<number> {
    return recoverOrphanedUsages(this.manager);
  }
  async meters(resourceId: number): Promise<ResourceMeter[]> {
    return toApplicationRecord(await this.manager.find(ResourceMeter, { where: { resourceId } }));
  }
}
